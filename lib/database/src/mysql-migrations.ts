import { createHash } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import type { SqlEngine } from './connection.js';
const uuid = 'char(36) CHARACTER SET ascii COLLATE ascii_bin';
const key = 'varchar(80) CHARACTER SET ascii COLLATE ascii_bin';
const stamp = 'datetime(3)';
const created = `${stamp} NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`;
const permissionSchema = JSON.stringify({
  type: 'array',
  maxItems: 200,
  items: { type: 'string', pattern: '^[a-z][a-z0-9]*([.][a-z][a-z0-9]*)*:[a-z][a-z0-9_]*$' },
});
const table = (name: string, body: string) =>
  `CREATE TABLE ${name} (${body}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`;
export interface MySqlMigration {
  readonly id: string;
  readonly statements: readonly string[];
}
/** SQL natif et historique propres aux moteurs MySQL/MariaDB ; ne réécrit aucune migration PostgreSQL. */
export const mysqlMigrations: readonly MySqlMigration[] = Object.freeze([
  {
    id: '0001_core_schema',
    statements: [
      table(
        'orkobi_core__engine_metadata',
        `singleton boolean PRIMARY KEY,engine varchar(20) NOT NULL`,
      ),
    ],
  },
  {
    id: '0002_platform',
    statements: [
      table(
        'orkobi_core__users',
        `id ${uuid} PRIMARY KEY,email varchar(254) NOT NULL UNIQUE,name varchar(120) NOT NULL,password_hash varchar(256) NOT NULL,active boolean NOT NULL DEFAULT true,platform_admin boolean NOT NULL DEFAULT false,created_at ${created},CHECK(email=lower(email))`,
      ),
      table(
        'orkobi_core__installation',
        `singleton boolean PRIMARY KEY DEFAULT true,administrator_id ${uuid} NOT NULL,initialized_at ${created},CHECK(singleton=1),FOREIGN KEY(administrator_id) REFERENCES orkobi_core__users(id)`,
      ),
      table(
        'orkobi_core__organizations',
        `id ${uuid} PRIMARY KEY,name varchar(120) NOT NULL,kind varchar(20) NOT NULL,active boolean NOT NULL DEFAULT true,locale varchar(5) NOT NULL DEFAULT 'fr',timezone varchar(80) NOT NULL DEFAULT 'Europe/Paris',CHECK(kind IN ('business','association')),CHECK(locale IN ('fr','en'))`,
      ),
      table(
        'orkobi_core__roles',
        `id ${uuid} PRIMARY KEY,organization_id ${uuid} NOT NULL,name varchar(120) NOT NULL,permissions json NOT NULL,builtin varchar(10),UNIQUE(organization_id,id),UNIQUE(organization_id,name),UNIQUE(organization_id,builtin),FOREIGN KEY(organization_id) REFERENCES orkobi_core__organizations(id),CHECK(JSON_TYPE(permissions)='ARRAY'),CHECK(JSON_LENGTH(permissions)<=200),CHECK(builtin IN ('admin','member'))`,
      ),
      table(
        'orkobi_core__memberships',
        `organization_id ${uuid} NOT NULL,user_id ${uuid} NOT NULL,role_id ${uuid} NOT NULL,active boolean NOT NULL DEFAULT true,PRIMARY KEY(organization_id,user_id),FOREIGN KEY(organization_id) REFERENCES orkobi_core__organizations(id),FOREIGN KEY(user_id) REFERENCES orkobi_core__users(id),FOREIGN KEY(organization_id,role_id) REFERENCES orkobi_core__roles(organization_id,id)`,
      ),
      table(
        'orkobi_core__sessions',
        `token_hash char(64) CHARACTER SET ascii PRIMARY KEY,id ${uuid} NOT NULL UNIQUE,user_id ${uuid} NOT NULL,csrf_token char(64) NOT NULL,active_organization_id ${uuid},created_at ${created},last_seen_at ${created},expires_at ${stamp} NOT NULL,revoked boolean NOT NULL DEFAULT false,INDEX sessions_user_idx(user_id),FOREIGN KEY(user_id) REFERENCES orkobi_core__users(id),FOREIGN KEY(active_organization_id) REFERENCES orkobi_core__organizations(id)`,
      ),
      table(
        'orkobi_core__oidc_identities',
        `id ${uuid} PRIMARY KEY,user_id ${uuid} NOT NULL,issuer varchar(2048) NOT NULL,subject varchar(255) NOT NULL,issuer_hash binary(32) GENERATED ALWAYS AS (UNHEX(SHA2(issuer,256))) STORED,UNIQUE(issuer_hash,subject),FOREIGN KEY(user_id) REFERENCES orkobi_core__users(id)`,
      ),
      table(
        'orkobi_core__authentication_attempts',
        `key_hash char(64) CHARACTER SET ascii PRIMARY KEY,attempts integer NOT NULL,window_started_at ${created}`,
      ),
      table(
        'orkobi_core__audit_events',
        `id ${uuid} PRIMARY KEY,actor_id ${uuid},organization_id ${uuid},event varchar(254) NOT NULL,target_id varchar(254),created_at ${created},INDEX audit_org_idx(organization_id,created_at),FOREIGN KEY(actor_id) REFERENCES orkobi_core__users(id),FOREIGN KEY(organization_id) REFERENCES orkobi_core__organizations(id)`,
      ),
    ],
  },
  {
    id: '0003_modules',
    statements: [
      table(
        'orkobi_core__modules',
        `id ${key} PRIMARY KEY,version varchar(40) NOT NULL,name varchar(120) NOT NULL,manifest json NOT NULL,enabled boolean NOT NULL DEFAULT false,registered_at ${created},updated_at ${created}`,
      ),
      table(
        'orkobi_core__organization_modules',
        `organization_id ${uuid} NOT NULL,module_id ${key} NOT NULL,enabled boolean NOT NULL DEFAULT true,enabled_at ${created},PRIMARY KEY(organization_id,module_id),INDEX org_modules_active(module_id,enabled),FOREIGN KEY(organization_id) REFERENCES orkobi_core__organizations(id),FOREIGN KEY(module_id) REFERENCES orkobi_core__modules(id)`,
      ),
    ],
  },
  {
    id: '0004_module_demo',
    statements: [
      table(
        'orkobi_demo__notes',
        `id ${uuid} PRIMARY KEY,organization_id ${uuid} NOT NULL,title varchar(120) NOT NULL,content text NOT NULL DEFAULT (''),created_by ${uuid},created_at ${created},updated_at ${created},INDEX notes_org(organization_id,created_at),FOREIGN KEY(organization_id) REFERENCES orkobi_core__organizations(id),FOREIGN KEY(created_by) REFERENCES orkobi_core__users(id)`,
      ),
    ],
  },
  {
    id: '0005_identity_advanced',
    statements: [
      table(
        'orkobi_core__mfa_factors',
        `user_id ${uuid} PRIMARY KEY,secret varchar(80) NOT NULL,confirmed_at ${stamp},created_at ${created},FOREIGN KEY(user_id) REFERENCES orkobi_core__users(id)`,
      ),
      table(
        'orkobi_core__mfa_recovery_codes',
        `id ${uuid} PRIMARY KEY,user_id ${uuid} NOT NULL,code_hash char(64) NOT NULL UNIQUE,used_at ${stamp},INDEX recovery_user(user_id),FOREIGN KEY(user_id) REFERENCES orkobi_core__users(id)`,
      ),
      table(
        'orkobi_core__mfa_challenges',
        `challenge_hash char(64) PRIMARY KEY,user_id ${uuid} NOT NULL,expires_at ${stamp} NOT NULL,FOREIGN KEY(user_id) REFERENCES orkobi_core__users(id)`,
      ),
      table(
        'orkobi_core__oidc_pending',
        `state_hash char(64) PRIMARY KEY,nonce varchar(128) NOT NULL,code_verifier varchar(128) NOT NULL,link_user_id ${uuid},created_at ${created},FOREIGN KEY(link_user_id) REFERENCES orkobi_core__users(id)`,
      ),
      'ALTER TABLE orkobi_core__sessions ADD COLUMN user_agent varchar(200)',
      `ALTER TABLE orkobi_core__oidc_identities ADD COLUMN created_at ${created}`,
    ],
  },
  {
    id: '0006_api_access',
    statements: [
      table(
        'orkobi_core__integration_tokens',
        `id ${uuid} PRIMARY KEY,name varchar(120) NOT NULL,token_hash char(64) NOT NULL UNIQUE,organization_id ${uuid},scopes json NOT NULL,created_by ${uuid} NOT NULL,created_at ${created},expires_at ${stamp},revoked_at ${stamp},last_used_at ${stamp},INDEX integration_org(organization_id),FOREIGN KEY(organization_id) REFERENCES orkobi_core__organizations(id),FOREIGN KEY(created_by) REFERENCES orkobi_core__users(id),CHECK(JSON_TYPE(scopes)='ARRAY'),CHECK(JSON_LENGTH(scopes)>0),CHECK(JSON_CONTAINS(JSON_ARRAY('organizations:read','modules:read','audit:read'),scopes))`,
      ),
      table(
        'orkobi_core__platform_settings',
        '`key` varchar(80) PRIMARY KEY,value boolean NOT NULL',
      ),
      "INSERT INTO orkobi_core__platform_settings (`key`,value) VALUES ('integrations_enabled',false)",
      'ALTER TABLE orkobi_core__organizations ADD COLUMN integrations_enabled boolean NOT NULL DEFAULT true',
    ],
  },
  {
    id: '0007_identity_hardening',
    statements: ['ALTER TABLE orkobi_core__mfa_factors ADD COLUMN last_used_step bigint'],
  },
  {
    id: '0008_jobs',
    statements: [
      table(
        'orkobi_core__jobs',
        `id ${uuid} PRIMARY KEY,organization_id ${uuid} NOT NULL,module_id ${key} NOT NULL,task varchar(80) NOT NULL,created_by ${uuid} NOT NULL,status varchar(20) NOT NULL DEFAULT 'pending',attempts integer NOT NULL DEFAULT 0,run_at ${stamp} NOT NULL,interval_seconds integer,last_error varchar(80),cycle_id ${uuid} NOT NULL,created_at ${created},updated_at ${created},INDEX jobs_due(status,run_at),INDEX jobs_org(organization_id,created_at),FOREIGN KEY(organization_id) REFERENCES orkobi_core__organizations(id),FOREIGN KEY(module_id) REFERENCES orkobi_core__modules(id),FOREIGN KEY(created_by) REFERENCES orkobi_core__users(id),CHECK(status IN ('pending','running','succeeded','failed','suspended','cancelled')),CHECK(attempts>=0),CHECK(interval_seconds BETWEEN 60 AND 31536000)`,
      ),
      table(
        'orkobi_core__job_runs',
        `id ${uuid} PRIMARY KEY,job_id ${uuid} NOT NULL,attempt integer NOT NULL,started_at ${created},finished_at ${stamp},outcome varchar(20),duration_ms integer,INDEX job_runs_job(job_id,started_at),FOREIGN KEY(job_id) REFERENCES orkobi_core__jobs(id),CHECK(outcome IN ('succeeded','failed','timeout','interrupted','suspended','cancelled'))`,
      ),
    ],
  },
  {
    id: '0009_plugins',
    statements: [
      `ALTER TABLE orkobi_core__roles ADD CONSTRAINT roles_permissions_valid CHECK(JSON_SCHEMA_VALID('${permissionSchema}',permissions))`,
      table(
        'orkobi_core__plugins',
        `id ${key} PRIMARY KEY,artifact json NOT NULL,digest char(64) NOT NULL,installed boolean NOT NULL DEFAULT true,installed_by ${uuid} NOT NULL,installed_at ${created},FOREIGN KEY(id) REFERENCES orkobi_core__modules(id),FOREIGN KEY(installed_by) REFERENCES orkobi_core__users(id)`,
      ),
      table(
        'orkobi_core__plugin_records',
        `id ${uuid} PRIMARY KEY,plugin_id ${key} NOT NULL,entity varchar(60) NOT NULL,organization_id ${uuid} NOT NULL,\`values\` json NOT NULL,created_by ${uuid} NOT NULL,created_at ${created},updated_at ${created},INDEX plugin_scope(plugin_id,organization_id,entity,created_at),FOREIGN KEY(plugin_id) REFERENCES orkobi_core__plugins(id),FOREIGN KEY(organization_id) REFERENCES orkobi_core__organizations(id),FOREIGN KEY(created_by) REFERENCES orkobi_core__users(id),CHECK(JSON_TYPE(\`values\`)='OBJECT')`,
      ),
    ],
  },
  {
    id: '0010_store',
    statements: [
      table(
        'orkobi_core__store_checkpoints',
        `repository_id varchar(40) CHARACTER SET ascii PRIMARY KEY,catalog_sequence bigint NOT NULL,digest char(64) NOT NULL,key_id char(64) NOT NULL,checked_at ${created},CHECK(catalog_sequence>0)`,
      ),
      table(
        'orkobi_core__plugin_origins',
        `plugin_id ${key} PRIMARY KEY,repository_id varchar(40) CHARACTER SET ascii NOT NULL,key_id char(64) NOT NULL,catalog_sequence bigint NOT NULL,digest char(64) NOT NULL,verified boolean NOT NULL DEFAULT true,FOREIGN KEY(plugin_id) REFERENCES orkobi_core__plugins(id)`,
      ),
    ],
  },
  {
    id: '0011_business',
    statements: [
      table(
        'orkobi_business__records',
        `id ${uuid} PRIMARY KEY,organization_id ${uuid} NOT NULL,module_id ${key} NOT NULL,entity varchar(60) NOT NULL,data json NOT NULL,state varchar(30) NOT NULL,reference_key varchar(200) CHARACTER SET ascii COLLATE ascii_bin,amount_minor bigint NOT NULL DEFAULT 0,parent_id ${uuid},revision integer NOT NULL DEFAULT 1,created_by ${uuid} NOT NULL,created_at ${created},updated_at ${created},UNIQUE(organization_id,id),UNIQUE(organization_id,module_id,entity,reference_key),INDEX business_scope(organization_id,module_id,entity,id),INDEX business_parent(organization_id,parent_id,state),FOREIGN KEY(organization_id) REFERENCES orkobi_core__organizations(id),FOREIGN KEY(module_id) REFERENCES orkobi_core__modules(id),FOREIGN KEY(created_by) REFERENCES orkobi_core__users(id),FOREIGN KEY(organization_id,parent_id) REFERENCES orkobi_business__records(organization_id,id),CHECK(revision>0),CHECK(JSON_TYPE(data)='OBJECT')`,
      ),
      table(
        'orkobi_business__counters',
        `organization_id ${uuid} NOT NULL,series varchar(40) NOT NULL,counter integer NOT NULL,PRIMARY KEY(organization_id,series),FOREIGN KEY(organization_id) REFERENCES orkobi_core__organizations(id),CHECK(counter>0)`,
      ),
      table(
        'orkobi_business__operations',
        `organization_id ${uuid} NOT NULL,user_id ${uuid} NOT NULL,operation_key ${uuid} NOT NULL,request_hash char(64) NOT NULL,result json NOT NULL,PRIMARY KEY(organization_id,user_id,operation_key),FOREIGN KEY(organization_id) REFERENCES orkobi_core__organizations(id),FOREIGN KEY(user_id) REFERENCES orkobi_core__users(id)`,
      ),
      table(
        'orkobi_business__attachments',
        `record_id ${uuid} PRIMARY KEY,organization_id ${uuid} NOT NULL,content_base64 longtext NOT NULL,sha256 char(64) NOT NULL,size integer NOT NULL,media_type varchar(80) NOT NULL,FOREIGN KEY(organization_id,record_id) REFERENCES orkobi_business__records(organization_id,id),CHECK(size BETWEEN 1 AND 49152)`,
      ),
    ],
  },
]);
export const mysqlChecksum = (migration: MySqlMigration) =>
  createHash('sha256').update(JSON.stringify(migration.statements)).digest('hex');
const historyTable = 'orkobi_infrastructure__schema_migrations';
interface History {
  id: string;
  checksum: string;
  state: string;
}
function validateHistory(rows: History[], expected: readonly MySqlMigration[]) {
  for (const [i, row] of rows.entries())
    if (
      row.state !== 'applied' ||
      expected[i]?.id !== row.id ||
      mysqlChecksum(expected[i]!) !== row.checksum
    )
      throw new Error('Historique SQL incomplet ou incompatible.');
}
export async function mysqlSchemaIsCurrent(
  client: PoolConnection,
  engine: SqlEngine,
): Promise<boolean> {
  const [rows] = await client.query({
    sql: `SELECT id,checksum,state FROM ${historyTable} ORDER BY id`,
    timeout: 2000,
  });
  validateHistory(rows as History[], mysqlMigrations);
  const [metadata] = await client.query({
    sql: 'SELECT engine FROM orkobi_core__engine_metadata WHERE singleton=true',
    timeout: 2000,
  });
  return (
    (rows as History[]).length === mysqlMigrations.length &&
    (metadata as { engine: string }[])[0]?.engine === engine
  );
}
/** DDL non transactionnel : journal préalable durable et refus d'un lot partiel, sans reprise implicite. */
export async function applyMySqlMigrations(
  client: PoolConnection,
  engine: SqlEngine,
  expected: readonly MySqlMigration[] = mysqlMigrations,
): Promise<string[]> {
  const [locks] = await client.query(
    "SELECT GET_LOCK(SHA2(CONCAT(DATABASE(),':migration'),256),10) AS locked",
  );
  if (!(locks as { locked: number }[])[0]?.locked) throw new Error('Migration déjà en cours.');
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${historyTable}(id varchar(80) CHARACTER SET ascii PRIMARY KEY,checksum char(64) NOT NULL,state varchar(20) NOT NULL,applied_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB`,
    );
    const [rows] = await client.query(`SELECT id,checksum,state FROM ${historyTable} ORDER BY id`);
    validateHistory(rows as History[], expected);
    if ((rows as History[]).length) {
      const [metadata] = await client.query(
        'SELECT engine FROM orkobi_core__engine_metadata WHERE singleton=true',
      );
      if ((metadata as { engine: string }[])[0]?.engine !== engine)
        throw new Error('Historique du moteur incompatible.');
    }
    const applied = [];
    for (const migration of expected.slice((rows as History[]).length)) {
      await client.query(`INSERT INTO ${historyTable}(id,checksum,state) VALUES(?,?,'applying')`, [
        migration.id,
        mysqlChecksum(migration),
      ]);
      for (const sql of migration.statements) await client.query(sql);
      if (migration.id === '0001_core_schema')
        await client.query(
          'INSERT INTO orkobi_core__engine_metadata(singleton,engine) VALUES(true,?)',
          [engine],
        );
      await client.query(`UPDATE ${historyTable} SET state='applied' WHERE id=?`, [migration.id]);
      applied.push(migration.id);
    }
    // Compte runtime : aucun DDL, aucune écriture de l'historique, audits append-only.
    const reads = ['orkobi_core__engine_metadata', historyTable];
    for (const name of reads)
      await client.query(
        `GRANT SELECT ON \`${client.config.database}\`.\`${name}\` TO 'orkobi_app'@'%'`,
      );
    for (const migration of mysqlMigrations)
      for (const sql of migration.statements) {
        const name = /^CREATE TABLE (\w+)/u.exec(sql)?.[1];
        if (!name || reads.includes(name)) continue;
        const rights = [
          'orkobi_core__audit_events',
          'orkobi_business__operations',
          'orkobi_business__attachments',
        ].includes(name)
          ? 'SELECT, INSERT'
          : 'SELECT, INSERT, UPDATE';
        await client.query(
          `GRANT ${rights} ON \`${client.config.database}\`.\`${name}\` TO 'orkobi_app'@'%'`,
        );
      }
    for (const name of [
      'orkobi_demo__notes',
      'orkobi_core__plugin_records',
      'orkobi_core__mfa_factors',
      'orkobi_core__mfa_recovery_codes',
      'orkobi_core__mfa_challenges',
      'orkobi_core__oidc_pending',
      'orkobi_core__oidc_identities',
    ])
      await client.query(
        `GRANT DELETE ON \`${client.config.database}\`.\`${name}\` TO 'orkobi_app'@'%'`,
      );
    return applied;
  } finally {
    await client.query("SELECT RELEASE_LOCK(SHA2(CONCAT(DATABASE(),':migration'),256))");
  }
}
