import type { Pool, PoolClient } from 'pg';
import type {
  PlatformUser,
  PlatformOrganization,
  OrganizationRole,
  OrganizationMembership,
  AccessibleOrganization,
  AuditEntry,
  SessionSummary,
  ModuleManifest,
} from '@orkobi/contracts';
import type { OrganizationContext } from '@orkobi/contracts';
import { moduleTransaction } from './adapter.js';
import type { ModuleDataOwner } from './adapter.js';

const userColumns = 'id, email, name, active, platform_admin AS "platformAdmin"';
const orgColumns = 'id, name, kind, active, locale, timezone';
const roleColumns = 'id, organization_id AS "organizationId", name, permissions, builtin';
const moduleColumns = 'id, version, name, manifest, enabled';
export interface CredentialUser extends PlatformUser {
  passwordHash: string;
}
export interface StoredSession {
  id: string;
  userId: string;
  csrfToken: string;
  activeOrganizationId: string | null;
}
export interface StoredModule {
  id: string;
  version: string;
  name: string;
  manifest: ModuleManifest;
  enabled: boolean;
}

/** Requêtes privées au Core. Aucune identité reçue de ce dépôt ne vaut autorisation. */
export class PlatformTransaction {
  /** Réutilise la transaction d'autorisation et d'audit, sans nouvelle connexion. */
  moduleData(owner: ModuleDataOwner, context: OrganizationContext) {
    return moduleTransaction(this.client, owner, context);
  }
  constructor(private readonly client: PoolClient) {}

  async lockAdministration() {
    // Sérialise initialisation et changements de droits pour protéger les derniers admins.
    await this.client.query('SELECT pg_advisory_xact_lock(1869769583, 2)');
  }
  async initialized(): Promise<boolean> {
    return (await this.client.query('SELECT 1 FROM orkobi_core.installation')).rowCount === 1;
  }
  async install(userId: string) {
    await this.client.query('INSERT INTO orkobi_core.installation (administrator_id) VALUES ($1)', [
      userId,
    ]);
  }
  async userByEmail(email: string): Promise<CredentialUser | undefined> {
    return (
      await this.client.query<CredentialUser>(
        `SELECT ${userColumns}, password_hash AS "passwordHash" FROM orkobi_core.users WHERE email = $1 FOR SHARE`,
        [email],
      )
    ).rows[0];
  }
  async user(id: string): Promise<PlatformUser | undefined> {
    return (
      await this.client.query<PlatformUser>(
        `SELECT ${userColumns} FROM orkobi_core.users WHERE id = $1 FOR SHARE`,
        [id],
      )
    ).rows[0];
  }
  async users(): Promise<PlatformUser[]> {
    return (
      await this.client.query<PlatformUser>(
        `SELECT ${userColumns} FROM orkobi_core.users ORDER BY created_at, id LIMIT 200`,
      )
    ).rows;
  }
  async createUser(id: string, email: string, name: string, hash: string, admin: boolean) {
    await this.client.query(
      'INSERT INTO orkobi_core.users (id,email,name,password_hash,platform_admin) VALUES ($1,$2,$3,$4,$5)',
      [id, email, name, hash, admin],
    );
  }
  async updateUser(id: string, name: string, active: boolean, admin: boolean) {
    await this.client.query(
      'UPDATE orkobi_core.users SET name=$2, active=$3, platform_admin=$4 WHERE id=$1',
      [id, name, active, admin],
    );
    if (!active)
      await this.client.query('UPDATE orkobi_core.sessions SET revoked=true WHERE user_id=$1', [
        id,
      ]);
  }
  async platformAdminCount(): Promise<number> {
    return (
      await this.client.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM orkobi_core.users WHERE active AND platform_admin',
      )
    ).rows[0]!.count;
  }
  async lastAdminOrganizations(userId: string): Promise<boolean> {
    const result = await this.client.query(
      `SELECT 1 FROM orkobi_core.memberships m JOIN orkobi_core.roles r ON r.id=m.role_id
      WHERE m.user_id=$1 AND m.active AND r.builtin='admin' AND NOT EXISTS (
        SELECT 1 FROM orkobi_core.memberships other JOIN orkobi_core.roles rr ON rr.id=other.role_id
        JOIN orkobi_core.users u ON u.id=other.user_id
        WHERE other.organization_id=m.organization_id AND other.user_id<>$1 AND other.active AND u.active AND rr.builtin='admin') LIMIT 1`,
      [userId],
    );
    return result.rowCount === 1;
  }
  async attempt(key: string): Promise<boolean> {
    const result = await this.client.query<{ attempts: number }>(
      `INSERT INTO orkobi_core.authentication_attempts (key_hash,attempts) VALUES ($1,1)
      ON CONFLICT (key_hash) DO UPDATE SET
        attempts=CASE WHEN authentication_attempts.window_started_at < now()-interval '15 minutes' THEN 1 ELSE authentication_attempts.attempts+1 END,
        window_started_at=CASE WHEN authentication_attempts.window_started_at < now()-interval '15 minutes' THEN now() ELSE authentication_attempts.window_started_at END
      RETURNING attempts`,
      [key],
    );
    return result.rows[0]!.attempts <= 10;
  }
  async createSession(hash: string, id: string, userId: string, csrf: string) {
    await this.client.query(
      `INSERT INTO orkobi_core.sessions (token_hash,id,user_id,csrf_token,expires_at)
      VALUES ($1,$2,$3,$4,now()+interval '8 hours')`,
      [hash, id, userId, csrf],
    );
  }
  async session(hash: string): Promise<StoredSession | undefined> {
    return (
      await this.client.query<StoredSession>(
        `SELECT id, user_id AS "userId", csrf_token AS "csrfToken", active_organization_id AS "activeOrganizationId"
      FROM orkobi_core.sessions WHERE token_hash=$1 AND NOT revoked AND expires_at>now() AND last_seen_at>now()-interval '30 minutes' FOR UPDATE`,
        [hash],
      )
    ).rows[0];
  }
  async touchSession(hash: string) {
    await this.client.query(
      'UPDATE orkobi_core.sessions SET last_seen_at=now() WHERE token_hash=$1',
      [hash],
    );
  }
  async selectOrganization(hash: string, id: string) {
    await this.client.query(
      'UPDATE orkobi_core.sessions SET active_organization_id=$2 WHERE token_hash=$1',
      [hash, id],
    );
  }
  async revokeSession(userId: string, id?: string) {
    const result = await this.client.query(
      `UPDATE orkobi_core.sessions SET revoked=true WHERE user_id=$1${id ? ' AND id=$2' : ''}`,
      id ? [userId, id] : [userId],
    );
    return result.rowCount ?? 0;
  }
  async sessions(userId: string, current: string): Promise<SessionSummary[]> {
    return (
      await this.client.query<SessionSummary>(
        `SELECT id, created_at::text AS "createdAt", expires_at::text AS "expiresAt", (id=$2) AS current
      FROM orkobi_core.sessions WHERE user_id=$1 AND NOT revoked AND expires_at>now() AND last_seen_at>now()-interval '30 minutes' ORDER BY created_at DESC LIMIT 100`,
        [userId, current],
      )
    ).rows;
  }
  async organizations(): Promise<PlatformOrganization[]> {
    return (
      await this.client.query<PlatformOrganization>(
        `SELECT ${orgColumns} FROM orkobi_core.organizations ORDER BY name, id LIMIT 200`,
      )
    ).rows;
  }
  async organization(id: string): Promise<PlatformOrganization | undefined> {
    return (
      await this.client.query<PlatformOrganization>(
        `SELECT ${orgColumns} FROM orkobi_core.organizations WHERE id=$1 FOR SHARE`,
        [id],
      )
    ).rows[0];
  }
  async accessibleOrganizations(userId: string): Promise<AccessibleOrganization[]> {
    return (
      await this.client.query<AccessibleOrganization>(
        `SELECT o.id,o.name,o.kind,o.active,o.locale,o.timezone,r.permissions
      FROM orkobi_core.organizations o JOIN orkobi_core.memberships m ON m.organization_id=o.id
      JOIN orkobi_core.roles r ON r.organization_id=m.organization_id AND r.id=m.role_id
      WHERE m.user_id=$1 AND m.active AND o.active ORDER BY o.name, o.id LIMIT 200`,
        [userId],
      )
    ).rows;
  }
  async createOrganization(org: PlatformOrganization) {
    await this.client.query(
      'INSERT INTO orkobi_core.organizations (id,name,kind,active,locale,timezone) VALUES ($1,$2,$3,$4,$5,$6)',
      [org.id, org.name, org.kind, org.active, org.locale, org.timezone],
    );
  }
  async updateOrganization(org: PlatformOrganization) {
    await this.client.query(
      'UPDATE orkobi_core.organizations SET name=$2,kind=$3,active=$4,locale=$5,timezone=$6 WHERE id=$1',
      [org.id, org.name, org.kind, org.active, org.locale, org.timezone],
    );
  }
  async roles(orgId: string): Promise<OrganizationRole[]> {
    return (
      await this.client.query<OrganizationRole>(
        `SELECT ${roleColumns} FROM orkobi_core.roles WHERE organization_id=$1 ORDER BY builtin NULLS LAST, name LIMIT 200`,
        [orgId],
      )
    ).rows;
  }
  async role(orgId: string, id: string): Promise<OrganizationRole | undefined> {
    return (
      await this.client.query<OrganizationRole>(
        `SELECT ${roleColumns} FROM orkobi_core.roles WHERE organization_id=$1 AND id=$2 FOR SHARE`,
        [orgId, id],
      )
    ).rows[0];
  }
  async saveRole(
    id: string,
    orgId: string,
    name: string,
    permissions: readonly string[],
    builtin: string | null = null,
  ) {
    await this.client.query(
      `INSERT INTO orkobi_core.roles (id,organization_id,name,permissions,builtin) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,permissions=EXCLUDED.permissions WHERE roles.organization_id=EXCLUDED.organization_id`,
      [id, orgId, name, permissions, builtin],
    );
  }
  async members(orgId: string): Promise<OrganizationMembership[]> {
    return (
      await this.client.query<OrganizationMembership>(
        `SELECT m.user_id AS "userId",u.name,u.email,m.active,m.role_id AS "roleId"
      FROM orkobi_core.memberships m JOIN orkobi_core.users u ON u.id=m.user_id WHERE organization_id=$1 ORDER BY u.name LIMIT 200`,
        [orgId],
      )
    ).rows;
  }
  async membership(
    orgId: string,
    userId: string,
  ): Promise<{ roleId: string; active: boolean } | undefined> {
    return (
      await this.client.query<{ roleId: string; active: boolean }>(
        'SELECT role_id AS "roleId",active FROM orkobi_core.memberships WHERE organization_id=$1 AND user_id=$2 FOR SHARE',
        [orgId, userId],
      )
    ).rows[0];
  }
  async adminCount(orgId: string): Promise<number> {
    return (
      await this.client.query<{ count: number }>(
        `SELECT count(*)::integer AS count FROM orkobi_core.memberships m
      JOIN orkobi_core.roles r ON r.id=m.role_id JOIN orkobi_core.users u ON u.id=m.user_id
      WHERE m.organization_id=$1 AND m.active AND u.active AND r.builtin='admin'`,
        [orgId],
      )
    ).rows[0]!.count;
  }
  async saveMember(orgId: string, userId: string, roleId: string, active: boolean) {
    await this.client.query(
      `INSERT INTO orkobi_core.memberships (organization_id,user_id,role_id,active) VALUES ($1,$2,$3,$4)
      ON CONFLICT (organization_id,user_id) DO UPDATE SET role_id=EXCLUDED.role_id,active=EXCLUDED.active`,
      [orgId, userId, roleId, active],
    );
  }
  async modules(): Promise<StoredModule[]> {
    return (
      await this.client.query<StoredModule>(
        `SELECT ${moduleColumns} FROM orkobi_core.modules ORDER BY id`,
      )
    ).rows;
  }
  async module(id: string): Promise<StoredModule | undefined> {
    return (
      await this.client.query<StoredModule>(
        `SELECT ${moduleColumns} FROM orkobi_core.modules WHERE id=$1 FOR SHARE`,
        [id],
      )
    ).rows[0];
  }
  /** Upsert du manifeste ; l'état d'activation plateforme existant est conservé. */
  async registerModule(id: string, version: string, name: string, manifest: ModuleManifest) {
    await this.client.query(
      `INSERT INTO orkobi_core.modules (id,version,name,manifest) VALUES ($1,$2,$3,$4)
      ON CONFLICT (id) DO UPDATE SET version=EXCLUDED.version,name=EXCLUDED.name,manifest=EXCLUDED.manifest,updated_at=now()
      WHERE (modules.version,modules.name,modules.manifest) IS DISTINCT FROM (EXCLUDED.version,EXCLUDED.name,EXCLUDED.manifest)`,
      [id, version, name, manifest],
    );
  }
  async setModuleEnabled(id: string, enabled: boolean) {
    await this.client.query(
      'UPDATE orkobi_core.modules SET enabled=$2, updated_at=now() WHERE id=$1',
      [id, enabled],
    );
  }
  async organizationModules(orgId: string): Promise<{ moduleId: string; enabled: boolean }[]> {
    return (
      await this.client.query<{ moduleId: string; enabled: boolean }>(
        `SELECT module_id AS "moduleId", enabled FROM orkobi_core.organization_modules WHERE organization_id=$1`,
        [orgId],
      )
    ).rows;
  }
  async organizationModuleCount(moduleId: string): Promise<number> {
    return (
      await this.client.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM orkobi_core.organization_modules WHERE module_id=$1 AND enabled',
        [moduleId],
      )
    ).rows[0]!.count;
  }
  async setOrganizationModule(orgId: string, moduleId: string, enabled: boolean) {
    await this.client.query(
      `INSERT INTO orkobi_core.organization_modules (organization_id,module_id,enabled) VALUES ($1,$2,$3)
      ON CONFLICT (organization_id,module_id) DO UPDATE SET enabled=EXCLUDED.enabled,enabled_at=now()`,
      [orgId, moduleId, enabled],
    );
  }
  async audit(
    id: string,
    actor: string | null,
    event: string,
    org: string | null = null,
    target: string | null = null,
  ) {
    await this.client.query(
      'INSERT INTO orkobi_core.audit_events (id,actor_id,event,organization_id,target_id) VALUES ($1,$2,$3,$4,$5)',
      [id, actor, event, org, target],
    );
  }
  async audits(orgId: string | null): Promise<AuditEntry[]> {
    return (
      await this.client.query<AuditEntry>(
        `SELECT a.id,a.actor_id AS "actorId",actor.name AS "actorName",a.organization_id AS "organizationId",a.event,a.target_id AS "targetId",
      coalesce(target_user.name,target_org.name,target_role.name) AS "targetName",a.created_at::text AS "createdAt"
      FROM orkobi_core.audit_events a LEFT JOIN orkobi_core.users actor ON actor.id=a.actor_id
      LEFT JOIN orkobi_core.users target_user ON target_user.id::text=a.target_id
      LEFT JOIN orkobi_core.organizations target_org ON target_org.id::text=a.target_id
      LEFT JOIN orkobi_core.roles target_role ON target_role.id::text=a.target_id
      ${orgId ? 'WHERE a.organization_id=$1' : ''} ORDER BY a.created_at DESC, a.id LIMIT 200`,
        orgId ? [orgId] : [],
      )
    ).rows;
  }
}

export class PlatformRepository {
  constructor(private readonly pool: Pool) {}
  async transaction<T>(operation: (repository: PlatformTransaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '2s'");
      const result = await operation(new PlatformTransaction(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
