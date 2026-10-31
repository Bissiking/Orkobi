import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { builtinAdminPermissions, organizationPermissions } from '@orkobi/contracts';
import type {
  OrganizationPermission,
  PlatformSession,
  PlatformUser,
  PlatformOrganization,
} from '@orkobi/contracts';
import type { PlatformTransaction, StoredSession } from '@orkobi/database';
import { CoreDatabase } from '../database.service.js';
import { CapabilityRegistry } from '../modules/capability-registry.js';
import { ModuleManager } from '../modules/manager.js';
import { ModuleDataService } from '../modules/data.js';
import { hashPassword, verifyPassword, dummyPasswordHash } from './password.js';
import { PLATFORM_CONFIG } from './config.js';
import type { PlatformConfig } from './config.js';

type Body = Record<string, unknown>;
export interface PlatformRequest {
  token: string;
  csrf: string;
  body: unknown;
}
export interface PlatformResult {
  data: unknown;
  token?: string;
  clearCookie?: boolean;
}
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
const moduleIdSource = '[a-z][a-z0-9]*(?:\\.[a-z][a-z0-9]*)+';
const anonymous: PlatformSession = {
  user: null,
  csrfToken: null,
  activeOrganizationId: null,
  organizations: [],
};
function equal(left: string, right: string) {
  const a = Buffer.from(left),
    b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function object(value: unknown): Body {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException();
  return value as Body;
}
function text(value: unknown, max = 120): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > max ||
    [...value].some((character) => character.charCodeAt(0) < 32)
  )
    throw new BadRequestException();
  return value.trim();
}
function email(value: unknown): string {
  const address = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(address)) throw new BadRequestException();
  return address;
}
function password(value: unknown): string {
  if (typeof value !== 'string' || value.length < 15 || value.length > 128)
    throw new BadRequestException();
  return value;
}
function uuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(value)
  )
    throw new BadRequestException();
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new BadRequestException();
  return value;
}
function organization(body: Body, id: string, active: boolean): PlatformOrganization {
  if (body.kind !== 'business' && body.kind !== 'association') throw new BadRequestException();
  if (body.locale !== 'fr' && body.locale !== 'en') throw new BadRequestException();
  const timezone = text(body.timezone, 80);
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
  } catch {
    throw new BadRequestException();
  }
  return { id, name: text(body.name), kind: body.kind, locale: body.locale, timezone, active };
}

@Injectable()
export class PlatformService {
  // Borne aussi la mémoire occupée par les dérivations scrypt concurrentes.
  private passwordOperations = 0;
  constructor(
    @Inject(CoreDatabase) private readonly database: CoreDatabase,
    @Inject(PLATFORM_CONFIG) private readonly config: PlatformConfig,
    @Inject(ModuleManager) private readonly moduleManager: ModuleManager,
    @Inject(ModuleDataService) private readonly moduleData: ModuleDataService,
    @Inject(CapabilityRegistry) private readonly capabilities: CapabilityRegistry,
  ) {}

  private async derive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.passwordOperations >= 2) throw new HttpException('Réessayer ultérieurement.', 429);
    this.passwordOperations++;
    try {
      return await operation();
    } finally {
      this.passwordOperations--;
    }
  }
  private async authenticate(repo: PlatformTransaction, request: PlatformRequest, write: boolean) {
    if (!/^[a-f0-9]{64}$/u.test(request.token)) throw new UnauthorizedException();
    const session = await repo.session(tokenHash(request.token));
    if (!session) throw new UnauthorizedException();
    const user = await repo.user(session.userId);
    if (!user?.active) throw new UnauthorizedException();
    if (write && !equal(request.csrf, session.csrfToken)) throw new ForbiddenException();
    await repo.touchSession(tokenHash(request.token));
    return { user, session };
  }
  private async snapshot(
    repo: PlatformTransaction,
    user: PlatformUser,
    session: StoredSession,
  ): Promise<PlatformSession> {
    const organizations = await repo.accessibleOrganizations(user.id);
    return {
      user,
      csrfToken: session.csrfToken,
      organizations,
      activeOrganizationId: organizations.some((org) => org.id === session.activeOrganizationId)
        ? session.activeOrganizationId
        : null,
    };
  }
  private async authorizeOrganization(
    repo: PlatformTransaction,
    user: PlatformUser,
    orgId: string,
    permission: OrganizationPermission,
  ) {
    const org = await repo.organization(orgId);
    const member = await repo.membership(orgId, user.id);
    if (!org?.active || !member?.active) throw new ForbiddenException();
    const role = await repo.role(orgId, member.roleId);
    if (!role?.permissions.includes(permission)) throw new ForbiddenException();
    return role.permissions;
  }

  async execute(
    method: 'GET' | 'POST',
    path: string,
    request: PlatformRequest,
  ): Promise<PlatformResult> {
    if (method === 'GET' && path === 'status') {
      if (!(await this.database.isReady()))
        return { data: { initialized: false, databaseReady: false, modulesReady: false } };
      const repository = await this.database.repository();
      return {
        data: {
          initialized: await repository.transaction((repo) => repo.initialized()),
          databaseReady: true,
          modulesReady: true,
        },
      };
    }
    const repository = await this.database.repository();
    try {
      if (method === 'POST' && path === 'setup') {
        const body = object(request.body);
        if (!this.config.setupToken) throw new ServiceUnavailableException();
        if (typeof body.setupToken !== 'string' || !equal(body.setupToken, this.config.setupToken))
          throw new ForbiddenException();
        const address = email(body.email),
          name = text(body.name);
        const hash = await this.derive(() => hashPassword(password(body.password)));
        return await repository.transaction(async (repo) => {
          await repo.lockAdministration();
          if (await repo.initialized()) throw new ConflictException();
          const id = randomUUID();
          await repo.createUser(id, address, name, hash, true);
          await repo.install(id);
          await repo.audit(randomUUID(), id, 'instance.initialized', null, id);
          return { data: { initialized: true } };
        });
      }
      if (method === 'POST' && path === 'login') {
        const body = object(request.body),
          address = email(body.email);
        if (typeof body.password !== 'string' || body.password.length > 128)
          throw new BadRequestException();
        const allowed = await repository.transaction((repo) => repo.attempt(tokenHash(address)));
        if (!allowed) throw new HttpException('Réessayer ultérieurement.', 429);
        const candidate = await repository.transaction((repo) => repo.userByEmail(address));
        const valid = await this.derive(() =>
          verifyPassword(body.password as string, candidate?.passwordHash ?? dummyPasswordHash),
        );
        return await repository.transaction(async (repo) => {
          await repo.lockAdministration();
          const current = candidate ? await repo.userByEmail(address) : undefined;
          if (!valid || !current?.active || current.passwordHash !== candidate?.passwordHash) {
            await repo.audit(randomUUID(), null, 'identity.login_failed');
            return { data: { authenticated: false } };
          }
          const token = randomBytes(32).toString('hex'),
            csrf = randomBytes(32).toString('hex'),
            id = randomUUID();
          await repo.createSession(tokenHash(token), id, current.id, csrf);
          // Une nouvelle connexion remplace le jeton déjà présenté par ce navigateur.
          if (/^[a-f0-9]{64}$/u.test(request.token)) {
            const previous = await repo.session(tokenHash(request.token));
            if (previous) await repo.revokeSession(previous.userId, previous.id);
          }
          await repo.audit(randomUUID(), current.id, 'identity.login');
          const { passwordHash: _passwordHash, ...user } = current;
          void _passwordHash;
          return {
            token,
            data: await this.snapshot(repo, user, {
              id,
              userId: current.id,
              csrfToken: csrf,
              activeOrganizationId: null,
            }),
          };
        });
      }
      return await repository.transaction(async (repo) => {
        // Même ordre de verrous pour mutations, sessions et révocations concurrentes.
        await repo.lockAdministration();
        let auth;
        try {
          auth = await this.authenticate(repo, request, method === 'POST');
        } catch (error) {
          if (method === 'GET' && path === 'session' && error instanceof UnauthorizedException)
            return { data: anonymous };
          throw error;
        }
        const { user, session } = auth;
        if (method === 'GET' && path === 'session')
          return { data: await this.snapshot(repo, user, session) };
        if (method === 'GET' && path === 'sessions')
          return { data: await repo.sessions(user.id, session.id) };
        const body = method === 'POST' ? object(request.body) : {};
        if (method === 'POST' && path === 'logout') {
          await repo.revokeSession(user.id, session.id);
          await repo.audit(randomUUID(), user.id, 'identity.logout');
          return { data: { success: true }, clearCookie: true };
        }
        if (method === 'POST' && path === 'sessions/revoke') {
          const id = uuid(body.sessionId);
          if (!(await repo.revokeSession(user.id, id))) throw new NotFoundException();
          await repo.audit(randomUUID(), user.id, 'identity.session_revoked', null, id);
          return { data: { success: true }, ...(id === session.id ? { clearCookie: true } : {}) };
        }
        if (method === 'POST' && path === 'profile') {
          await repo.updateUser(user.id, text(body.name), user.active, user.platformAdmin);
          await repo.audit(randomUUID(), user.id, 'identity.profile_updated', null, user.id);
          return { data: { success: true } };
        }
        if (method === 'GET' && path === 'capabilities')
          return { data: await this.capabilities.status() };
        if (method === 'GET' && path === 'modules') {
          const orgId = session.activeOrganizationId;
          if (!orgId) throw new BadRequestException();
          await this.authorizeOrganization(repo, user, orgId, 'modules:read');
          return { data: await this.moduleManager.listForOrganization(repo, orgId) };
        }
        const activationMatch = new RegExp(
          `^modules/(${moduleIdSource})/(activate|deactivate)$`,
        ).exec(path);
        if (method === 'POST' && activationMatch) {
          const orgId = session.activeOrganizationId;
          if (!orgId) throw new BadRequestException();
          await this.authorizeOrganization(repo, user, orgId, 'modules:write');
          await this.moduleManager.setOrganizationActive(
            repo,
            user.id,
            orgId,
            activationMatch[1]!,
            activationMatch[2] === 'activate',
          );
          return { data: { success: true } };
        }
        const dataMatch = new RegExp(
          `^modules/(${moduleIdSource})/data/([a-z][a-z0-9_]*)(?:/([a-f0-9-]{36})(/delete)?)?$`,
        ).exec(path);
        if (dataMatch) {
          const orgId = session.activeOrganizationId;
          if (!orgId) throw new BadRequestException();
          const [, moduleId, entity, entryId, remove] = dataMatch;
          if (method === 'GET' && !entryId)
            return { data: await this.moduleData.list(repo, orgId, user.id, moduleId!, entity!) };
          if (method === 'POST') {
            if (remove) {
              await this.moduleData.remove(repo, orgId, user.id, moduleId!, entity!, entryId!);
              return { data: { success: true } };
            }
            if (entryId)
              return {
                data: await this.moduleData.update(
                  repo,
                  orgId,
                  user.id,
                  moduleId!,
                  entity!,
                  entryId!,
                  body,
                ),
              };
            return {
              data: await this.moduleData.create(repo, orgId, user.id, moduleId!, entity!, body),
            };
          }
        }
        if (path.startsWith('admin/')) {
          if (!user.platformAdmin) throw new ForbiddenException();
          if (method === 'GET' && path === 'admin/users') return { data: await repo.users() };
          if (method === 'GET' && path === 'admin/organizations')
            return { data: await repo.organizations() };
          if (method === 'GET' && path === 'admin/audit') return { data: await repo.audits(null) };
          if (method === 'GET' && path === 'admin/modules')
            return { data: await this.moduleManager.listForAdministration(repo) };
          const adminModuleMatch = new RegExp(`^admin/modules/(${moduleIdSource})$`).exec(path);
          if (method === 'POST' && adminModuleMatch) {
            await this.moduleManager.setPlatformEnabled(
              repo,
              user.id,
              adminModuleMatch[1]!,
              boolean(body.enabled),
            );
            return { data: { success: true } };
          }
          // La dérivation a lieu avant la transaction dans createUser(), voir le contrôleur.
          if (method === 'POST' && path === 'admin/users') {
            const hash = text(body.preparedHash, 256);
            const id = randomUUID();
            await repo.createUser(
              id,
              email(body.email),
              text(body.name),
              hash,
              boolean(body.platformAdmin),
            );
            await repo.audit(randomUUID(), user.id, 'identity.user_created', null, id);
            return { data: { id } };
          }
          const userMatch = /^admin\/users\/([^/]+)$/u.exec(path);
          if (method === 'POST' && userMatch) {
            const targetId = uuid(userMatch[1]),
              target = await repo.user(targetId);
            if (!target) throw new NotFoundException();
            const active = boolean(body.active),
              admin = boolean(body.platformAdmin);
            if (
              target.active &&
              target.platformAdmin &&
              (!active || !admin) &&
              (await repo.platformAdminCount()) <= 1
            )
              throw new ConflictException();
            if (target.active && !active && (await repo.lastAdminOrganizations(targetId)))
              throw new ConflictException();
            await repo.updateUser(targetId, text(body.name), active, admin);
            await repo.audit(randomUUID(), user.id, 'identity.user_updated', null, targetId);
            return { data: { success: true } };
          }
          if (method === 'POST' && path === 'admin/organizations') {
            const ownerId = uuid(body.ownerId),
              owner = await repo.user(ownerId);
            if (!owner?.active) throw new BadRequestException();
            const org = organization(body, randomUUID(), true);
            await repo.createOrganization(org);
            const adminRole = randomUUID();
            await repo.saveRole(
              adminRole,
              org.id,
              'Administrateur',
              [...builtinAdminPermissions],
              'admin',
            );
            await repo.saveRole(
              randomUUID(),
              org.id,
              'Membre',
              ['organization:read', 'modules:read'],
              'member',
            );
            await repo.saveMember(org.id, ownerId, adminRole, true);
            await repo.audit(randomUUID(), user.id, 'organization.created', org.id, org.id);
            return { data: org };
          }
          const orgMatch = /^admin\/organizations\/([^/]+)(?:\/(members|roles))?$/u.exec(path);
          if (method === 'GET' && orgMatch) {
            const orgId = uuid(orgMatch[1]);
            if (!(await repo.organization(orgId))) throw new NotFoundException();
            if (orgMatch[2] === 'members') return { data: await repo.members(orgId) };
            if (orgMatch[2] === 'roles') return { data: await repo.roles(orgId) };
          }
          if (method === 'POST' && orgMatch) {
            const orgId = uuid(orgMatch[1]);
            if (!(await repo.organization(orgId))) throw new NotFoundException();
            if (orgMatch[2])
              return this.saveMember(repo, user, orgId, body, organizationPermissions);
            await repo.updateOrganization(organization(body, orgId, boolean(body.active)));
            await repo.audit(randomUUID(), user.id, 'organization.updated', orgId, orgId);
            return { data: { success: true } };
          }
          throw new NotFoundException();
        }
        if (method === 'GET' && path === 'organizations')
          return { data: await repo.accessibleOrganizations(user.id) };
        const match = /^organizations\/([^/]+)(?:\/(select|members|roles|audit))?$/u.exec(path);
        if (match) {
          const orgId = uuid(match[1]),
            section = match[2];
          const permission =
            section === 'members'
              ? method === 'GET'
                ? 'members:read'
                : 'members:write'
              : section === 'roles'
                ? method === 'GET'
                  ? 'members:read'
                  : 'roles:write'
                : section === 'audit'
                  ? 'audit:read'
                  : method === 'POST' && section !== 'select'
                    ? 'organization:write'
                    : 'organization:read';
          const permissions = await this.authorizeOrganization(repo, user, orgId, permission);
          if (method === 'GET') {
            if (section === 'members') return { data: await repo.members(orgId) };
            if (section === 'roles') return { data: await repo.roles(orgId) };
            if (section === 'audit') return { data: await repo.audits(orgId) };
            if (!section) return { data: await repo.organization(orgId) };
          } else {
            if (section === 'select') {
              await repo.selectOrganization(tokenHash(request.token), orgId);
              await repo.audit(randomUUID(), user.id, 'organization.selected', orgId, orgId);
              return { data: { success: true } };
            }
            if (section === 'members') return this.saveMember(repo, user, orgId, body, permissions);
            if (section === 'roles') {
              const id = body.id ? uuid(body.id) : randomUUID();
              const existing = await repo.role(orgId, id);
              if (body.id && !existing) throw new NotFoundException();
              if (existing?.builtin) throw new ForbiddenException();
              if (existing?.permissions.some((permission) => !permissions.includes(permission)))
                throw new ForbiddenException();
              if (
                !Array.isArray(body.permissions) ||
                body.permissions.some((key) => !permissions.includes(key as OrganizationPermission))
              )
                throw new ForbiddenException();
              await repo.saveRole(id, orgId, text(body.name), [
                ...new Set(body.permissions),
              ] as OrganizationPermission[]);
              await repo.audit(randomUUID(), user.id, 'organization.role_saved', orgId, id);
              return { data: { id } };
            }
            if (!section) {
              await repo.updateOrganization(organization(body, orgId, true));
              await repo.audit(
                randomUUID(),
                user.id,
                'organization.settings_updated',
                orgId,
                orgId,
              );
              return { data: { success: true } };
            }
          }
        }
        throw new NotFoundException();
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505')
        throw new ConflictException();
      throw error;
    }
  }
  async prepareUser(request: PlatformRequest): Promise<Body> {
    const repository = await this.database.repository();
    await repository.transaction(async (repo) => {
      await repo.lockAdministration();
      const { user } = await this.authenticate(repo, request, true);
      if (!user.platformAdmin) throw new ForbiddenException();
    });
    const input = object(request.body);
    return {
      ...input,
      preparedHash: await this.derive(() => hashPassword(password(input.password))),
    };
  }
  private async saveMember(
    repo: PlatformTransaction,
    actor: PlatformUser,
    orgId: string,
    body: Body,
    permissions: readonly string[],
  ): Promise<PlatformResult> {
    const target = await repo.userByEmail(email(body.email));
    if (!target?.active) throw new BadRequestException();
    const role = await repo.role(orgId, uuid(body.roleId));
    if (!role || role.permissions.some((permission) => !permissions.includes(permission)))
      throw new ForbiddenException();
    const active = boolean(body.active),
      current = await repo.membership(orgId, target.id);
    const oldRole = current ? await repo.role(orgId, current.roleId) : undefined;
    if (
      current?.active &&
      oldRole?.builtin === 'admin' &&
      (!active || role.builtin !== 'admin') &&
      (await repo.adminCount(orgId)) <= 1
    )
      throw new ConflictException();
    // Un délégant ne peut pas modifier une appartenance plus privilégiée que lui.
    if (oldRole?.permissions.some((permission) => !permissions.includes(permission)))
      throw new ForbiddenException();
    await repo.saveMember(orgId, target.id, role.id, active);
    await repo.audit(randomUUID(), actor.id, 'organization.membership_saved', orgId, target.id);
    return { data: { success: true } };
  }
}
