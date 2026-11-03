import { randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { integrationScopes } from '@orkobi/contracts';
import type { PlatformUser } from '@orkobi/contracts';
import type { PlatformTransaction } from '@orkobi/database';
import { CoreDatabase } from '../database.service.js';
import { ModuleManager } from '../modules/manager.js';
import { PLATFORM_CONFIG } from './config.js';
import type { PlatformConfig } from './config.js';
import { equal, text, tokenHash } from './access.js';

@Injectable()
export class IntegrationAccessService {
  constructor(
    @Inject(CoreDatabase) private readonly database: CoreDatabase,
    @Inject(ModuleManager) private readonly modules: ModuleManager,
  ) {}

  async administration(
    repo: PlatformTransaction,
    user: PlatformUser,
    method: 'GET' | 'POST',
    path: string,
    body: Record<string, unknown>,
  ): Promise<{ data: unknown } | undefined> {
    if (
      !['admin/integrations', 'admin/integration-tokens'].includes(path) &&
      !/^admin\/integration-tokens\/[a-f0-9-]{36}\/revoke$/u.test(path)
    )
      return undefined;
    if (!user.platformAdmin) throw new ForbiddenException();
    if (path === 'admin/integrations') {
      if (method === 'POST') {
        if (typeof body.enabled !== 'boolean') throw new BadRequestException();
        await repo.setIntegrationsEnabled(body.enabled);
        await repo.audit(randomUUID(), user.id, 'integration.settings_updated');
      }
      return { data: { enabled: await repo.integrationsEnabled() } };
    }
    if (path === 'admin/integration-tokens' && method === 'GET')
      return { data: await repo.integrationTokens() };
    if (path.endsWith('/revoke') && method === 'POST') {
      const id = path.split('/')[2]!;
      if (!(await repo.integrationToken(id))) throw new NotFoundException();
      await repo.revokeIntegrationToken(id);
      await repo.audit(randomUUID(), user.id, 'integration.token_revoked', null, id);
      return { data: { success: true } };
    }
    if (method !== 'POST' || path !== 'admin/integration-tokens') throw new NotFoundException();
    if (
      !Array.isArray(body.scopes) ||
      !body.scopes.length ||
      body.scopes.some(
        (scope) =>
          typeof scope !== 'string' || !(integrationScopes as readonly string[]).includes(scope),
      )
    )
      throw new BadRequestException();
    const orgId =
      body.organizationId === null ||
      body.organizationId === undefined ||
      body.organizationId === ''
        ? null
        : text(body.organizationId, 36);
    if (
      orgId &&
      (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(orgId) ||
        !(await repo.organization(orgId)))
    )
      throw new BadRequestException();
    let expiresAt: string | null = null;
    if (body.expiresAt !== null && body.expiresAt !== undefined && body.expiresAt !== '') {
      if (
        typeof body.expiresAt !== 'string' ||
        !Number.isFinite(Date.parse(body.expiresAt)) ||
        Date.parse(body.expiresAt) <= Date.now()
      )
        throw new BadRequestException();
      expiresAt = new Date(body.expiresAt).toISOString();
    }
    const token = `okit_${randomBytes(32).toString('hex')}`,
      id = randomUUID();
    await repo.createIntegrationToken({
      id,
      name: text(body.name),
      hash: tokenHash(token),
      organizationId: orgId,
      scopes: [...new Set(body.scopes)] as string[],
      createdBy: user.id,
      expiresAt,
    });
    await repo.audit(randomUUID(), user.id, 'integration.token_created', orgId, id);
    return { data: { id, token } };
  }

  async execute(path: string, authorization: string): Promise<unknown> {
    const repository = await this.database.repository();
    const result = await repository.transaction(async (repo) => {
      await repo.lockAdministration();
      const bearer = /^Bearer (okit_[a-f0-9]{64})$/u.exec(authorization);
      const token = bearer ? await repo.integrationTokenByHash(tokenHash(bearer[1]!)) : undefined;
      const creator = token ? await repo.user(token.createdBy) : undefined;
      let status = 200,
        data: unknown;
      const match =
        /^organizations(?:\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})(?:\/(modules|audit))?)?$/u.exec(
          path,
        );
      const orgId = match?.[1] ?? null;
      if (
        !token ||
        token.revokedAt ||
        (token.expiresAt && Date.parse(token.expiresAt) <= Date.now()) ||
        !creator?.active ||
        !creator.platformAdmin
      )
        status = 401;
      else if (!(await repo.integrationsEnabled())) status = 403;
      else if (!match) status = 404;
      else {
        const scope =
          match[2] === 'modules'
            ? 'modules:read'
            : match[2] === 'audit'
              ? 'audit:read'
              : 'organizations:read';
        if (
          !token.scopes.includes(scope) ||
          (orgId && token.organizationId && token.organizationId !== orgId)
        )
          status = 403;
        else if (!orgId) {
          const organizations = [];
          for (const org of await repo.organizations()) {
            if (
              (!token.organizationId || org.id === token.organizationId) &&
              (await repo.integrationAllowed(org.id))
            )
              organizations.push(org);
          }
          data = { organizations };
        } else if (!(await repo.integrationAllowed(orgId))) status = 403;
        else if (match[2] === 'modules') data = await this.modules.listForOrganization(repo, orgId);
        else if (match[2] === 'audit') data = { audit: await repo.audits(orgId) };
        else data = await repo.organization(orgId);
      }
      await repo.audit(
        randomUUID(),
        creator?.id ?? null,
        status === 200 ? 'integration.call' : 'integration.denied',
        orgId && (await repo.organization(orgId)) ? orgId : null,
        token?.id ?? null,
      );
      if (status === 200 && token) await repo.touchIntegrationToken(token.id);
      return { status, data };
    });
    if (result.status !== 200) throw new HttpException('Opération refusée.', result.status);
    return result.data;
  }
}

@Controller('integration')
export class IntegrationController {
  constructor(
    @Inject(IntegrationAccessService) private readonly access: IntegrationAccessService,
    @Inject(PLATFORM_CONFIG) private readonly config: PlatformConfig,
  ) {}
  @Get('{*path}')
  read(@Req() request: Request) {
    if (
      this.config.internalToken &&
      !equal(String(request.headers['x-orkobi-internal'] ?? ''), this.config.internalToken)
    )
      throw new ForbiddenException();
    return this.access.execute(
      request.path.slice('/integration/'.length),
      request.headers.authorization ?? '',
    );
  }
}
