import { randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PlatformUser } from '@orkobi/contracts';
import type { PlatformTransaction } from '@orkobi/database';
import { CoreDatabase } from '../database.service.js';
import { PLATFORM_CONFIG } from './config.js';
import type { PlatformConfig } from './config.js';
import type { PlatformRequest, PlatformResult } from './service.js';
import {
  authenticateSession,
  equal,
  object,
  password,
  sessionSnapshot,
  text,
  tokenHash,
} from './access.js';
import {
  generateRecoveryCode,
  generateTotpSecret,
  matchingTotpStep,
  otpauthUrl,
  recoveryCodePattern,
} from './totp.js';
import { hashPassword, verifyPassword } from './password.js';
import { OidcProvider, OidcRejectedError, OidcUnavailableError } from './oidc.js';

/** Parcours d'identité avancée ; aucun appel réseau OIDC ne retient une transaction SQL. */
@Injectable()
export class AdvancedIdentityService {
  private readonly provider: OidcProvider | null;
  private derivations = 0;
  constructor(
    @Inject(CoreDatabase) private readonly database: CoreDatabase,
    @Inject(PLATFORM_CONFIG) private readonly config: PlatformConfig,
  ) {
    this.provider = config.oidc ? new OidcProvider(config.oidc) : null;
  }
  private async throttle(key: string) {
    const repo = await this.database.repository();
    if (!(await repo.transaction((tx) => tx.attempt(tokenHash(key)))))
      throw new HttpException('Réessayer ultérieurement.', 429);
  }
  private async derive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.derivations >= 2) throw new HttpException('Réessayer ultérieurement.', 429);
    this.derivations++;
    try {
      return await operation();
    } finally {
      this.derivations--;
    }
  }
  async login(
    repo: PlatformTransaction,
    user: PlatformUser,
    request: PlatformRequest,
  ): Promise<PlatformResult> {
    if ((await repo.mfaFactor(user.id))?.confirmedAt) {
      const challenge = randomBytes(32).toString('hex');
      await repo.createMfaChallenge(tokenHash(challenge), user.id);
      return { data: { authenticated: true, mfaRequired: true, challenge } };
    }
    return this.issueSession(repo, user, request);
  }
  private async issueSession(
    repo: PlatformTransaction,
    user: PlatformUser,
    request: PlatformRequest,
  ): Promise<PlatformResult> {
    const token = randomBytes(32).toString('hex'),
      csrf = randomBytes(32).toString('hex'),
      id = randomUUID();
    await repo.createSession(tokenHash(token), id, user.id, csrf, request.userAgent ?? null);
    if (/^[a-f0-9]{64}$/u.test(request.token)) {
      const previous = await repo.session(tokenHash(request.token));
      if (previous) await repo.revokeSession(previous.userId, previous.id);
    }
    await repo.audit(randomUUID(), user.id, 'identity.login');
    return {
      token,
      data: await sessionSnapshot(repo, user, {
        id,
        userId: user.id,
        csrfToken: csrf,
        activeOrganizationId: null,
      }),
    };
  }
  private async consumeCode(
    repo: PlatformTransaction,
    userId: string,
    code: unknown,
  ): Promise<boolean> {
    if (typeof code !== 'string') throw new BadRequestException();
    const factor = await repo.mfaFactor(userId);
    if (!factor?.confirmedAt) return false;
    if (recoveryCodePattern.test(code)) return repo.consumeRecoveryCode(userId, tokenHash(code));
    let step: number | undefined;
    try {
      step = matchingTotpStep(factor.secret, code);
    } catch {
      return false;
    }
    return step !== undefined && (await repo.consumeMfaStep(userId, step));
  }
  async execute(
    method: 'GET' | 'POST',
    path: string,
    request: PlatformRequest,
  ): Promise<PlatformResult | undefined> {
    if (method === 'GET' && path === 'oidc/status')
      return {
        data: {
          enabled: !!this.provider,
          label: this.config.oidc ? new URL(this.config.oidc.issuer).hostname : null,
        },
      };
    if (method === 'POST' && path === 'oidc/start') return this.startOidc(request);
    if (method === 'POST' && path === 'oidc/callback') return this.callbackOidc(request);
    const handled =
      (method === 'GET' && ['mfa/status', 'oidc'].includes(path)) ||
      (method === 'POST' &&
        [
          'mfa/login',
          'mfa/enroll',
          'mfa/confirm',
          'mfa/disable',
          'oidc/unlink',
          'profile/password',
        ].includes(path));
    if (!handled) return undefined;
    const repository = await this.database.repository();
    const body = method === 'POST' ? object(request.body) : {};
    if (path === 'profile/password') return this.changePassword(request);
    if (method === 'POST')
      await this.throttle(
        `identity:${path}:${path === 'mfa/login' ? text(body.challenge, 64) : request.token}`,
      );
    if (path === 'mfa/login') {
      if (typeof body.challenge !== 'string' || !/^[a-f0-9]{64}$/u.test(body.challenge))
        throw new ForbiddenException();
      const result = await repository.transaction(async (repo) => {
        await repo.lockAdministration();
        const challenge = await repo.mfaChallenge(tokenHash(body.challenge as string));
        const user = challenge ? await repo.user(challenge.userId) : undefined;
        if (!user?.active || !(await this.consumeCode(repo, user.id, body.code))) {
          await repo.audit(randomUUID(), user?.id ?? null, 'identity.mfa_failed');
          return null;
        }
        await repo.deleteMfaChallenge(tokenHash(body.challenge as string));
        await repo.audit(randomUUID(), user.id, 'identity.mfa_verified');
        return this.issueSession(repo, user, request);
      });
      if (!result) throw new ForbiddenException();
      return result;
    }
    return repository.transaction(async (repo) => {
      await repo.lockAdministration();
      const { user, session } = await authenticateSession(repo, request, method === 'POST');
      const factor = await repo.mfaFactor(user.id);
      if (path === 'mfa/status')
        return {
          data: {
            enabled: !!factor?.confirmedAt,
            pending: !!factor && !factor.confirmedAt,
            recoveryCodesRemaining: await repo.recoveryCodesRemaining(user.id),
          },
        };
      if (path === 'oidc') return { data: await repo.oidcIdentities(user.id) };
      if (path === 'oidc/unlink') {
        if (!(await repo.unlinkOidc(user.id, text(body.issuer, 2048), text(body.subject, 255))))
          throw new BadRequestException();
        await repo.audit(randomUUID(), user.id, 'identity.oidc_unlinked');
        return { data: { success: true } };
      }
      if (path === 'mfa/enroll') {
        if (factor?.confirmedAt) throw new ConflictException();
        const secret = generateTotpSecret();
        await repo.saveMfaFactor(user.id, secret);
        await repo.audit(randomUUID(), user.id, 'identity.mfa_enrollment_started');
        return { data: { secret, otpauthUrl: otpauthUrl('Orkobi', user.email, secret) } };
      }
      if (path === 'mfa/confirm') {
        if (!factor || factor.confirmedAt || typeof body.code !== 'string')
          throw new BadRequestException();
        const step = matchingTotpStep(factor.secret, body.code);
        if (step === undefined) throw new ForbiddenException();
        await repo.consumeMfaStep(user.id, step);
        await repo.confirmMfaFactor(user.id);
        const codes = Array.from({ length: 10 }, () => generateRecoveryCode());
        await repo.replaceRecoveryCodes(
          user.id,
          codes.map((code) => ({ id: randomUUID(), hash: tokenHash(code) })),
        );
        await repo.revokeOtherSessions(user.id, session.id);
        await repo.deleteUserMfaChallenges(user.id);
        await repo.audit(randomUUID(), user.id, 'identity.mfa_enabled');
        return { data: { recoveryCodes: codes } };
      }
      if (!(await this.consumeCode(repo, user.id, body.code))) throw new ForbiddenException();
      await repo.deleteMfaFactor(user.id);
      await repo.deleteUserMfaChallenges(user.id);
      await repo.revokeOtherSessions(user.id, session.id);
      await repo.audit(randomUUID(), user.id, 'identity.mfa_disabled');
      return { data: { success: true } };
    });
  }
  private async changePassword(request: PlatformRequest): Promise<PlatformResult> {
    await this.throttle(`password:${request.token}`);
    const repository = await this.database.repository(),
      body = object(request.body);
    const candidate = await repository.transaction(async (repo) => {
      await repo.lockAdministration();
      const { user } = await authenticateSession(repo, request, true);
      return (await repo.userByEmail(user.email))!;
    });
    const hash = await this.derive(async () => {
      if (
        typeof body.currentPassword !== 'string' ||
        !(await verifyPassword(body.currentPassword, candidate.passwordHash))
      )
        throw new ForbiddenException();
      return hashPassword(password(body.password));
    });
    return repository.transaction(async (repo) => {
      await repo.lockAdministration();
      const { user, session } = await authenticateSession(repo, request, true);
      if ((await repo.userByEmail(user.email))?.passwordHash !== candidate.passwordHash)
        throw new ConflictException();
      await repo.setPassword(user.id, hash);
      await repo.revokeOtherSessions(user.id, session.id);
      await repo.deleteUserMfaChallenges(user.id);
      await repo.audit(randomUUID(), user.id, 'identity.password_changed');
      return { data: { success: true } };
    });
  }
  private async startOidc(request: PlatformRequest): Promise<PlatformResult> {
    if (!this.provider) throw new ServiceUnavailableException();
    const state = randomBytes(32).toString('hex'),
      nonce = randomBytes(32).toString('hex'),
      verifier = randomBytes(32).toString('base64url');
    let url: string;
    try {
      url = await this.provider.authorizationUrl(state, nonce, verifier);
    } catch (error) {
      this.oidcFailure(error);
    }
    const repository = await this.database.repository();
    await repository.transaction(async (repo) => {
      await repo.lockAdministration();
      const link = object(request.body).link === true;
      const userId = link ? (await authenticateSession(repo, request, true)).user.id : null;
      await repo.createOidcPending(tokenHash(state), nonce, verifier, userId);
    });
    return { oidcState: state, data: { url, state } };
  }
  private async callbackOidc(request: PlatformRequest): Promise<PlatformResult> {
    if (!this.provider || !this.config.oidc) throw new ServiceUnavailableException();
    const body = object(request.body),
      state = text(body.state, 64),
      code = text(body.code, 4096);
    if (!/^[a-f0-9]{64}$/u.test(state) || !request.oidcState || !equal(state, request.oidcState))
      throw new ForbiddenException();
    const repository = await this.database.repository();
    const pending = await repository.transaction(async (repo) => {
      await repo.lockAdministration();
      const pending = await repo.oidcPending(tokenHash(state));
      if (!pending) throw new ForbiddenException();
      await repo.deleteOidcPending(tokenHash(state));
      return pending;
    });
    let claims;
    try {
      claims = await this.provider.claims(
        await this.provider.exchange(code, pending.codeVerifier),
        pending.nonce,
      );
    } catch (error) {
      this.oidcFailure(error);
    }
    const issuer = this.config.oidc.issuer;
    return repository.transaction(async (repo) => {
      await repo.lockAdministration();
      const linked = await repo.oidcIdentity(issuer, claims.sub);
      if (pending.linkUserId) {
        const { user } = await authenticateSession(repo, request, true);
        if (user.id !== pending.linkUserId || (linked && linked.userId !== user.id))
          throw new ForbiddenException();
        if (!linked) await repo.linkOidc(user.id, issuer, claims.sub);
        await repo.audit(randomUUID(), user.id, 'identity.oidc_linked');
        return { oidcState: null, data: { linked: true } };
      }
      const candidate = linked
        ? await repo.user(linked.userId)
        : claims.emailVerified && claims.email
          ? await repo.userByEmail(claims.email)
          : undefined;
      if (!candidate?.active) throw new ForbiddenException();
      if (!linked) {
        await repo.linkOidc(candidate.id, issuer, claims.sub);
        await repo.audit(randomUUID(), candidate.id, 'identity.oidc_linked');
      }
      const { id, name, email, active, platformAdmin } = candidate;
      return {
        ...(await this.login(repo, { id, name, email, active, platformAdmin }, request)),
        oidcState: null,
      };
    });
  }
  private oidcFailure(error: unknown): never {
    if (error instanceof OidcRejectedError) throw new ForbiddenException();
    if (error instanceof OidcUnavailableError) throw new ServiceUnavailableException();
    throw error;
  }
}
