import type { PluginArtifact, ModuleEntry } from '@orkobi/contracts';
import { randomUUID } from 'node:crypto';
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
  LinkedIdentity,
  IntegrationTokenSummary,
} from '@orkobi/contracts';
import type { OrganizationContext } from '@orkobi/contracts';
import { moduleTransaction } from './adapter.js';
import { jobColumns } from './jobs.js';
import type { JobSummary, ScheduleJob } from '@orkobi/contracts';
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
export interface StoredMfaFactor {
  secret: string;
  confirmedAt: string | null;
}
export interface StoredMfaChallenge {
  userId: string;
  expiresAt: string;
}
export interface StoredOidcPending {
  nonce: string;
  codeVerifier: string;
  linkUserId: string | null;
  createdAt: string;
}
export interface StoredIntegrationToken {
  id: string;
  name: string;
  organizationId: string | null;
  scopes: string[];
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

/** Requêtes privées au Core. Aucune identité reçue de ce dépôt ne vaut autorisation. */
export class PlatformTransaction {
  async plugin(
    id: string,
  ): Promise<
    | { artifact: PluginArtifact; digest: string; installed: boolean; installedAt: string }
    | undefined
  > {
    return (
      await this.client.query(
        'SELECT artifact,digest,installed,installed_at::text AS "installedAt" FROM orkobi_core.plugins WHERE id=$1',
        [id],
      )
    ).rows[0];
  }
  async plugins(): Promise<
    {
      id: string;
      artifact: PluginArtifact;
      digest: string;
      installed: boolean;
      installedAt: string;
    }[]
  > {
    return (
      await this.client.query(
        'SELECT id,artifact,digest,installed,installed_at::text AS "installedAt" FROM orkobi_core.plugins ORDER BY id LIMIT 100',
      )
    ).rows;
  }
  async savePlugin(artifact: PluginArtifact, digest: string, userId: string) {
    await this.client.query(
      `INSERT INTO orkobi_core.plugins(id,artifact,digest,installed_by) VALUES($1,$2,$3,$4)
      ON CONFLICT(id) DO UPDATE SET artifact=EXCLUDED.artifact,digest=EXCLUDED.digest,installed=true,installed_by=EXCLUDED.installed_by,installed_at=now()`,
      [artifact.manifest.module.id, artifact, digest, userId],
    );
  }
  async removePlugin(id: string) {
    await this.client.query('UPDATE orkobi_core.plugins SET installed=false WHERE id=$1', [id]);
  }
  async pluginEntries(pluginId: string, orgId: string, entity: string): Promise<ModuleEntry[]> {
    return (
      await this.client.query<ModuleEntry>(
        `SELECT id,values,created_at::text AS "createdAt",updated_at::text AS "updatedAt"
      FROM orkobi_core.plugin_records WHERE plugin_id=$1 AND organization_id=$2 AND entity=$3 ORDER BY created_at DESC,id LIMIT 100`,
        [pluginId, orgId, entity],
      )
    ).rows;
  }
  async savePluginEntry(
    pluginId: string,
    orgId: string,
    entity: string,
    id: string,
    userId: string,
    values: Record<string, string>,
    update = false,
  ): Promise<ModuleEntry | undefined> {
    return (
      await this.client.query<ModuleEntry>(
        update
          ? `UPDATE orkobi_core.plugin_records SET values=$5,updated_at=now() WHERE plugin_id=$1 AND organization_id=$2 AND entity=$3 AND id=$4 RETURNING id,values,created_at::text AS "createdAt",updated_at::text AS "updatedAt"`
          : `INSERT INTO orkobi_core.plugin_records(plugin_id,organization_id,entity,id,values,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,values,created_at::text AS "createdAt",updated_at::text AS "updatedAt"`,
        update
          ? [pluginId, orgId, entity, id, values]
          : [pluginId, orgId, entity, id, values, userId],
      )
    ).rows[0];
  }
  async removePluginEntry(
    pluginId: string,
    orgId: string,
    entity: string,
    id: string,
  ): Promise<boolean> {
    return !!(
      await this.client.query(
        'DELETE FROM orkobi_core.plugin_records WHERE plugin_id=$1 AND organization_id=$2 AND entity=$3 AND id=$4',
        [pluginId, orgId, entity, id],
      )
    ).rowCount;
  }
  async tryJobLock(organizationId: string, moduleId: string, task: string): Promise<boolean> {
    return (
      await this.client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked',
        [`${organizationId}/${moduleId}/${task}`],
      )
    ).rows[0]!.locked;
  }
  async jobs(organizationId: string, userId: string): Promise<JobSummary[]> {
    return (
      await this.client.query<JobSummary>(
        `SELECT ${jobColumns} FROM orkobi_core.jobs WHERE organization_id=$1 AND created_by=$2 ORDER BY created_at DESC,id LIMIT 100`,
        [organizationId, userId],
      )
    ).rows;
  }
  async job(organizationId: string, id: string): Promise<JobSummary | undefined> {
    return (
      await this.client.query<JobSummary>(
        `SELECT ${jobColumns} FROM orkobi_core.jobs WHERE organization_id=$1 AND id=$2 FOR UPDATE`,
        [organizationId, id],
      )
    ).rows[0];
  }
  async createJob(id: string, organizationId: string, userId: string, input: ScheduleJob) {
    // Borne la file par organisation sans inclure l'historique terminé.
    const count = await this.client.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM orkobi_core.jobs WHERE organization_id=$1 AND status IN ('pending','running','suspended')",
      [organizationId],
    );
    if (count.rows[0]!.count >= 1000) return false;
    await this.client.query(
      `INSERT INTO orkobi_core.jobs(id,organization_id,module_id,task,created_by,run_at,interval_seconds,cycle_id)
      VALUES($1,$2,$3,$4,$5,coalesce($6::timestamptz,now()),$7,$1)`,
      [
        id,
        organizationId,
        input.moduleId,
        input.task,
        userId,
        input.runAt ?? null,
        input.intervalSeconds ?? null,
      ],
    );
    return true;
  }
  async changeJob(
    organizationId: string,
    id: string,
    status: 'pending' | 'cancelled',
    reset = false,
  ) {
    await this.client.query(
      `UPDATE orkobi_core.jobs SET status=$3,updated_at=now(),
      attempts=CASE WHEN $4::boolean THEN 0 ELSE attempts END,run_at=CASE WHEN $4::boolean THEN now() ELSE run_at END
      WHERE organization_id=$1 AND id=$2`,
      [organizationId, id, status, reset],
    );
  }
  async suspendModuleJobs(moduleId: string, organizationId?: string) {
    await this.client.query(
      `UPDATE orkobi_core.jobs SET status='suspended',updated_at=now(),last_error='module_disabled'
      WHERE module_id=$1 AND status IN ('pending','running')${organizationId ? ' AND organization_id=$2' : ''}`,
      organizationId ? [moduleId, organizationId] : [moduleId],
    );
  }
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
  async createSession(
    hash: string,
    id: string,
    userId: string,
    csrf: string,
    userAgent: string | null = null,
  ) {
    await this.client.query(
      `INSERT INTO orkobi_core.sessions (token_hash,id,user_id,csrf_token,user_agent,expires_at)
      VALUES ($1,$2,$3,$4,$5,now()+interval '8 hours')`,
      [hash, id, userId, csrf, userAgent],
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
  /** Conserve la session courante ; utilisé après un changement de mot de passe. */
  async revokeOtherSessions(userId: string, keepId: string) {
    const result = await this.client.query(
      'UPDATE orkobi_core.sessions SET revoked=true WHERE user_id=$1 AND id<>$2',
      [userId, keepId],
    );
    return result.rowCount ?? 0;
  }
  async sessions(userId: string, current: string): Promise<SessionSummary[]> {
    return (
      await this.client.query<SessionSummary>(
        `SELECT id, created_at::text AS "createdAt", expires_at::text AS "expiresAt",
      last_seen_at::text AS "lastSeenAt", user_agent AS "userAgent", (id=$2) AS current
      FROM orkobi_core.sessions WHERE user_id=$1 AND NOT revoked AND expires_at>now() AND last_seen_at>now()-interval '30 minutes' ORDER BY created_at DESC LIMIT 100`,
        [userId, current],
      )
    ).rows;
  }
  async setPassword(userId: string, hash: string) {
    await this.client.query('UPDATE orkobi_core.users SET password_hash=$2 WHERE id=$1', [
      userId,
      hash,
    ]);
  }

  async mfaFactor(userId: string): Promise<StoredMfaFactor | undefined> {
    return (
      await this.client.query<StoredMfaFactor>(
        'SELECT secret, confirmed_at::text AS "confirmedAt" FROM orkobi_core.mfa_factors WHERE user_id=$1 FOR SHARE',
        [userId],
      )
    ).rows[0];
  }
  /** Enregistre un secret en attente de confirmation ; une confirmation réinitialise l'état. */
  async saveMfaFactor(userId: string, secret: string) {
    await this.client.query(
      `INSERT INTO orkobi_core.mfa_factors (user_id,secret) VALUES ($1,$2)
      ON CONFLICT (user_id) DO UPDATE SET secret=EXCLUDED.secret, confirmed_at=NULL, last_used_step=NULL, created_at=now()`,
      [userId, secret],
    );
  }
  async confirmMfaFactor(userId: string): Promise<boolean> {
    const result = await this.client.query(
      'UPDATE orkobi_core.mfa_factors SET confirmed_at=now() WHERE user_id=$1 AND confirmed_at IS NULL',
      [userId],
    );
    return result.rowCount === 1;
  }
  async deleteMfaFactor(userId: string) {
    await this.client.query('DELETE FROM orkobi_core.mfa_factors WHERE user_id=$1', [userId]);
    await this.client.query('DELETE FROM orkobi_core.mfa_recovery_codes WHERE user_id=$1', [
      userId,
    ]);
  }
  async recoveryCodesRemaining(userId: string): Promise<number> {
    return (
      await this.client.query<{ count: number }>(
        'SELECT count(*)::integer AS count FROM orkobi_core.mfa_recovery_codes WHERE user_id=$1 AND used_at IS NULL',
        [userId],
      )
    ).rows[0]!.count;
  }
  async replaceRecoveryCodes(userId: string, entries: { id: string; hash: string }[]) {
    await this.client.query('DELETE FROM orkobi_core.mfa_recovery_codes WHERE user_id=$1', [
      userId,
    ]);
    for (const entry of entries)
      await this.client.query(
        'INSERT INTO orkobi_core.mfa_recovery_codes (id,user_id,code_hash) VALUES ($1,$2,$3)',
        [entry.id, userId, entry.hash],
      );
  }
  async consumeRecoveryCode(userId: string, hash: string): Promise<boolean> {
    const result = await this.client.query(
      `UPDATE orkobi_core.mfa_recovery_codes SET used_at=now()
      WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL`,
      [userId, hash],
    );
    return result.rowCount === 1;
  }
  async createMfaChallenge(hash: string, userId: string) {
    await this.client.query('DELETE FROM orkobi_core.mfa_challenges WHERE expires_at < now()');
    await this.client.query(
      `INSERT INTO orkobi_core.mfa_challenges (challenge_hash,user_id,expires_at)
      VALUES ($1,$2,now()+interval '5 minutes')`,
      [hash, userId],
    );
  }
  async mfaChallenge(hash: string): Promise<StoredMfaChallenge | undefined> {
    return (
      await this.client.query<StoredMfaChallenge>(
        `SELECT user_id AS "userId", expires_at::text AS "expiresAt"
      FROM orkobi_core.mfa_challenges WHERE challenge_hash=$1 AND expires_at>now() FOR UPDATE`,
        [hash],
      )
    ).rows[0];
  }
  async deleteMfaChallenge(hash: string) {
    await this.client.query('DELETE FROM orkobi_core.mfa_challenges WHERE challenge_hash=$1', [
      hash,
    ]);
  }
  async deleteUserMfaChallenges(userId: string) {
    await this.client.query('DELETE FROM orkobi_core.mfa_challenges WHERE user_id=$1', [userId]);
  }
  async consumeMfaStep(userId: string, step: number): Promise<boolean> {
    return (
      (
        await this.client.query(
          'UPDATE orkobi_core.mfa_factors SET last_used_step=$2 WHERE user_id=$1 AND (last_used_step IS NULL OR last_used_step<$2)',
          [userId, step],
        )
      ).rowCount === 1
    );
  }

  async createOidcPending(
    hash: string,
    nonce: string,
    codeVerifier: string,
    linkUserId: string | null,
  ) {
    await this.client.query(
      "DELETE FROM orkobi_core.oidc_pending WHERE created_at < now()-interval '15 minutes'",
    );
    await this.client.query(
      `INSERT INTO orkobi_core.oidc_pending (state_hash,nonce,code_verifier,link_user_id)
      VALUES ($1,$2,$3,$4)`,
      [hash, nonce, codeVerifier, linkUserId],
    );
  }
  async oidcPending(hash: string): Promise<StoredOidcPending | undefined> {
    return (
      await this.client.query<StoredOidcPending>(
        `SELECT nonce, code_verifier AS "codeVerifier", link_user_id AS "linkUserId", created_at::text AS "createdAt"
      FROM orkobi_core.oidc_pending WHERE state_hash=$1 AND created_at>now()-interval '10 minutes'`,
        [hash],
      )
    ).rows[0];
  }
  async deleteOidcPending(hash: string) {
    await this.client.query('DELETE FROM orkobi_core.oidc_pending WHERE state_hash=$1', [hash]);
  }
  async oidcIdentity(
    issuer: string,
    subject: string,
  ): Promise<{ userId: string; createdAt: string } | undefined> {
    return (
      await this.client.query<{ userId: string; createdAt: string }>(
        `SELECT user_id AS "userId", created_at::text AS "createdAt" FROM orkobi_core.oidc_identities
      WHERE issuer=$1 AND subject=$2 FOR SHARE`,
        [issuer, subject],
      )
    ).rows[0];
  }
  async oidcIdentities(userId: string): Promise<LinkedIdentity[]> {
    return (
      await this.client.query<LinkedIdentity>(
        `SELECT issuer, subject, created_at::text AS "createdAt" FROM orkobi_core.oidc_identities
      WHERE user_id=$1 ORDER BY created_at, issuer LIMIT 50`,
        [userId],
      )
    ).rows;
  }
  async linkOidc(userId: string, issuer: string, subject: string) {
    await this.client.query(
      'INSERT INTO orkobi_core.oidc_identities (id,user_id,issuer,subject) VALUES ($1,$2,$3,$4)',
      [randomUUID(), userId, issuer, subject],
    );
  }
  async unlinkOidc(userId: string, issuer: string, subject: string): Promise<number> {
    const result = await this.client.query(
      'DELETE FROM orkobi_core.oidc_identities WHERE user_id=$1 AND issuer=$2 AND subject=$3',
      [userId, issuer, subject],
    );
    return result.rowCount ?? 0;
  }

  async integrationsEnabled(): Promise<boolean> {
    return (
      await this.client.query<{ value: boolean }>(
        `SELECT coalesce((SELECT value FROM orkobi_core.platform_settings WHERE key='integrations_enabled'), false) AS value`,
      )
    ).rows[0]!.value;
  }
  async setIntegrationsEnabled(enabled: boolean) {
    await this.client.query(
      `INSERT INTO orkobi_core.platform_settings (key,value) VALUES ('integrations_enabled',$1)
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
      [enabled],
    );
  }
  async integrationAllowed(organizationId: string): Promise<boolean> {
    return (
      (
        await this.client.query<{ allowed: boolean }>(
          'SELECT active AND integrations_enabled AS allowed FROM orkobi_core.organizations WHERE id=$1',
          [organizationId],
        )
      ).rows[0]?.allowed === true
    );
  }
  async setOrganizationIntegrations(organizationId: string, enabled: boolean) {
    await this.client.query(
      'UPDATE orkobi_core.organizations SET integrations_enabled=$2 WHERE id=$1',
      [organizationId, enabled],
    );
  }
  async createIntegrationToken(token: {
    id: string;
    name: string;
    hash: string;
    organizationId: string | null;
    scopes: string[];
    createdBy: string;
    expiresAt: string | null;
  }) {
    await this.client.query(
      `INSERT INTO orkobi_core.integration_tokens
      (id,name,token_hash,organization_id,scopes,created_by,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        token.id,
        token.name,
        token.hash,
        token.organizationId,
        token.scopes,
        token.createdBy,
        token.expiresAt,
      ],
    );
  }
  async integrationTokens(): Promise<IntegrationTokenSummary[]> {
    return (
      await this.client.query<IntegrationTokenSummary>(
        `SELECT t.id, t.name, t.organization_id AS "organizationId", o.name AS "organizationName",
      t.scopes, t.created_at::text AS "createdAt", t.expires_at::text AS "expiresAt",
      t.revoked_at::text AS "revokedAt", t.last_used_at::text AS "lastUsedAt"
      FROM orkobi_core.integration_tokens t LEFT JOIN orkobi_core.organizations o ON o.id=t.organization_id
      ORDER BY t.created_at DESC, t.id LIMIT 200`,
      )
    ).rows;
  }
  async integrationToken(id: string): Promise<StoredIntegrationToken | undefined> {
    return (
      await this.client.query<StoredIntegrationToken>(
        `SELECT id, name, organization_id AS "organizationId", scopes, created_by AS "createdBy",
      created_at::text AS "createdAt", expires_at::text AS "expiresAt", revoked_at::text AS "revokedAt",
      last_used_at::text AS "lastUsedAt"
      FROM orkobi_core.integration_tokens WHERE id=$1 FOR SHARE`,
        [id],
      )
    ).rows[0];
  }
  async integrationTokenByHash(hash: string): Promise<StoredIntegrationToken | undefined> {
    return (
      await this.client.query<StoredIntegrationToken>(
        `SELECT id, name, organization_id AS "organizationId", scopes, created_by AS "createdBy",
      created_at::text AS "createdAt", expires_at::text AS "expiresAt", revoked_at::text AS "revokedAt",
      last_used_at::text AS "lastUsedAt"
      FROM orkobi_core.integration_tokens WHERE token_hash=$1 FOR SHARE`,
        [hash],
      )
    ).rows[0];
  }
  async revokeIntegrationToken(id: string): Promise<number> {
    const result = await this.client.query(
      'UPDATE orkobi_core.integration_tokens SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL',
      [id],
    );
    return result.rowCount ?? 0;
  }
  async touchIntegrationToken(id: string) {
    await this.client.query(
      'UPDATE orkobi_core.integration_tokens SET last_used_at=now() WHERE id=$1',
      [id],
    );
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
