import { createHash } from 'node:crypto';
import mysql from 'mysql2/promise';
import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { PostgreSqlConfig } from './config.js';
import type { SqlClient, SqlPool, SqlResult } from './connection.js';
import { PlatformRepository } from './platform.js';
import { JobRepository } from './jobs.js';
import { SqlModuleAdapter } from './adapter.js';
import type { ModuleDataOwner } from './adapter.js';
import { applyMySqlMigrations, mysqlSchemaIsCurrent } from './mysql-migrations.js';

const booleans = new Set([
  'active',
  'platformAdmin',
  'enabled',
  'installed',
  'current',
  'locked',
  'allowed',
  'integrations_enabled',
  'value',
]);
const json = new Set(['manifest', 'permissions', 'artifact', 'values', 'scopes']);
function normalize(row: Record<string, unknown>) {
  for (const [key, value] of Object.entries(row)) {
    if (key.endsWith('_at') && typeof value === 'string')
      row[key] = new Date(value.replace(' ', 'T') + 'Z');
    else if (booleans.has(key) && typeof value === 'number') row[key] = value === 1;
    else if (json.has(key) && typeof value === 'string') row[key] = JSON.parse(value);
  }
  return row;
}
/** Seulement les requêtes internes Core et le sous-ensemble CRUD validé sont admis ; aucun SQL plugin brut. */
export function compileMySql(
  text: string,
  parameters: unknown[] = [],
): { sql: string; values: (string | number | boolean | Date | Buffer | null)[] } {
  let sql = text.trim();
  sql = sql.replace(
    /\b([a-z_][a-z0-9_]*\.)?([a-z_]*_at)::text\b/gu,
    (_, prefix, name) => `DATE_FORMAT(${prefix ?? ''}${name},'%Y-%m-%dT%H:%i:%s.%fZ')`,
  );
  sql = sql.replace(/::(?:text|integer|int|boolean|uuid|timestamptz)\b/gu, '');
  sql = sql.replace(
    /interval '(\d+) (minutes?|hours?|seconds?)'/giu,
    (_, amount, unit) => `INTERVAL ${amount} ${unit.replace(/s$/u, '').toUpperCase()}`,
  );
  sql = sql.replace(/\(\$(\d+) \* INTERVAL 1 SECOND\)/gu, 'INTERVAL $$$1 SECOND');
  // Intervalles paramétrés du Job Engine.
  sql = sql.replace(/\(\$(\d+) \* interval '1 second'\)/gu, 'INTERVAL $$$1 SECOND');
  sql = sql.replace(/([a-z_]+) NULLS LAST/gu, '$1 IS NULL, $1');
  sql = sql.replace(/FOR SHARE/gu, 'LOCK IN SHARE MODE');
  if (/ON CONFLICT/iu.test(sql)) {
    const guarded = /WHERE roles\.organization_id=EXCLUDED\.organization_id/iu.test(sql);
    sql = sql.replace(
      /\s+WHERE \(modules\.version,modules\.name,modules\.manifest\) IS DISTINCT FROM \(EXCLUDED\.version,EXCLUDED\.name,EXCLUDED\.manifest\)/iu,
      '',
    );
    sql = sql.replace(/\s+WHERE roles\.organization_id=EXCLUDED\.organization_id/iu, '');
    sql = sql.replace(/ON CONFLICT\s*\([^)]*\) DO UPDATE SET/iu, 'ON DUPLICATE KEY UPDATE');
    sql = sql.replace(/EXCLUDED\.([a-z_]+)/gu, (_, column) => `VALUES(${column})`);
    if (guarded)
      sql = sql.replace(
        /\b(name|permissions)=VALUES\((name|permissions)\)/gu,
        (_, column) =>
          `${column}=IF(organization_id=VALUES(organization_id),VALUES(${column}),${column})`,
      );
    sql = sql.replace(/authentication_attempts\./gu, '`orkobi_core__authentication_attempts`.');
  }
  sql = sql.replace(/\b(orkobi_[a-z][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/gu, '`$1__$2`');
  sql = sql.replace(/"([A-Za-z_][A-Za-z0-9_]*)"/gu, '`$1`');
  sql = sql.replace(/(?<![a-zA-Z0-9_`])\b(values|key|current)\b(?!`)/gu, '`$1`');
  const values: (string | number | boolean | Date | Buffer | null)[] = [];
  sql = sql.replace(/\$([1-9][0-9]*)/gu, (_, index) => {
    if (Number(index) > parameters.length) throw new Error('Paramètre SQL manquant.');
    const value = parameters[Number(index) - 1];
    values.push(
      value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)
        ? JSON.stringify(value)
        : value === undefined
          ? null
          : (value as string | number | boolean | Date | Buffer | null),
    );
    return '?';
  });
  return { sql, values };
}
class MySqlClient implements SqlClient {
  readonly dialect: 'mysql' | 'mariadb';
  private readonly transactionLocks = new Set<string>();
  private readonly sessionLocks = new Set<string>();
  private released = false;
  constructor(
    readonly native: PoolConnection,
    readonly database: string,
    engine: 'mysql' | 'mariadb',
  ) {
    this.dialect = engine;
  }
  private lockName(value: string) {
    return createHash('sha256').update(`${this.database}:${value}`).digest('hex');
  }
  private async lock(value: string, wait: number, transaction: boolean) {
    const name = this.lockName(value),
      locks = transaction ? this.transactionLocks : this.sessionLocks;
    if (locks.has(name)) return true;
    const [rows] = await this.native.query<RowDataPacket[]>('SELECT GET_LOCK(?,?) AS locked', [
      name,
      wait,
    ]);
    if (rows[0]?.locked === 1) {
      locks.add(name);
      return true;
    }
    return false;
  }
  private async unlockTransaction() {
    for (const name of this.transactionLocks)
      await this.native.query('SELECT RELEASE_LOCK(?)', [name]);
    this.transactionLocks.clear();
  }
  async query<Row extends object = Record<string, unknown>>(
    text: string,
    parameters: unknown[] = [],
  ): Promise<SqlResult<Row>> {
    try {
      if (text.startsWith('INSERT INTO orkobi_core.roles ') && text.includes('ON CONFLICT')) {
        const existing = await this.query<{ organizationId: string }>(
          'SELECT organization_id AS "organizationId" FROM orkobi_core.roles WHERE id=$1 FOR UPDATE',
          [parameters[0]],
        );
        if (existing.rows[0])
          return existing.rows[0].organizationId === parameters[1]
            ? this.query<Row>(
                'UPDATE orkobi_core.roles SET name=$3,permissions=$4 WHERE id=$1 AND organization_id=$2',
                parameters,
              )
            : { rows: [], rowCount: 0 };
        return this.query<Row>(text.split(/\s+ON CONFLICT/iu)[0]!, parameters);
      }
      if (text.includes('pg_advisory_xact_lock(1869769583, 2)')) {
        if (!(await this.lock('administration', 2, true))) throw new Error('Verrou indisponible.');
        return { rows: [], rowCount: 1 };
      }
      if (text.includes('pg_try_advisory')) {
        const locked = await this.lock(String(parameters[0]), 0, text.includes('_xact_'));
        return { rows: [{ locked } as Row], rowCount: 1 };
      }
      if (text.includes('pg_advisory_unlock')) {
        const name = this.lockName(String(parameters[0]));
        await this.native.query('SELECT RELEASE_LOCK(?)', [name]);
        this.sessionLocks.delete(name);
        return { rows: [], rowCount: 1 };
      }
      if (text.startsWith('SET LOCAL lock_timeout')) {
        await this.native.query('SET SESSION innodb_lock_wait_timeout=2');
        return { rows: [], rowCount: 0 };
      }
      if (text.startsWith("SELECT set_config('orkobi.organization_id'"))
        return { rows: [], rowCount: 1 };
      const returning = /\s+RETURNING\s+([\s\S]+)$/iu.exec(text);
      const body = returning ? text.slice(0, returning.index) : text;
      const compiled = compileMySql(body, parameters);
      const [result] = /^(?:BEGIN|COMMIT|ROLLBACK|SET TRANSACTION\b)/u.test(compiled.sql)
        ? await this.native.query({ sql: compiled.sql, timeout: 4000 })
        : await this.native.execute({ sql: compiled.sql, timeout: 4000 }, compiled.values);
      if (text === 'COMMIT' || text === 'ROLLBACK') await this.unlockTransaction();
      if (Array.isArray(result)) {
        const rows = (result as Record<string, unknown>[]).map(normalize) as Row[];
        return { rows, rowCount: rows.length };
      }
      const count = (result as ResultSetHeader).affectedRows;
      if (returning && count > 0) {
        const table = /^(?:INSERT INTO|UPDATE)\s+(orkobi_[a-z_]+\.[a-z_]+)/iu.exec(body)?.[1];
        if (!table) throw new Error('Retour SQL non pris en charge.');
        let condition: string;
        if (/^INSERT/iu.test(body)) {
          const columns = /\(([^)]+)\)\s+VALUES\s*\(([^)]+)\)/iu.exec(body);
          if (!columns) throw new Error('Insertion inconnue.');
          const names = columns[1]!.split(',').map((s) => s.trim()),
            binds = columns[2]!.split(',').map((s) => s.trim());
          const primary = names.includes('id') ? 'id' : 'key_hash';
          const index = names.indexOf(primary);
          if (index < 0 || !/^\$[0-9]+$/u.test(binds[index]!))
            throw new Error('Clé de retour invalide.');
          condition = `${primary}=${binds[index]}`;
        } else {
          condition = /\bWHERE ([\s\S]+)$/iu.exec(body)?.[1] ?? '';
          if (!condition) throw new Error('Condition manquante.');
        }
        return this.query<Row>(
          `SELECT ${returning[1]} FROM ${table} WHERE ${condition}`,
          parameters,
        );
      }
      return { rows: [], rowCount: count };
    } catch (error) {
      if (text === 'COMMIT' || text === 'ROLLBACK') await this.unlockTransaction().catch(() => {});
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : 'database_error';
      if (['PROTOCOL_SEQUENCE_TIMEOUT', 'PROTOCOL_CONNECTION_LOST', 'ECONNRESET'].includes(code))
        this.native.destroy();
      throw Object.assign(new Error('Opération SQL impossible.'), {
        code:
          (
            {
              ER_DUP_ENTRY: '23505',
              ER_CANT_EXECUTE_IN_READ_ONLY_TRANSACTION: '25006',
              ER_NO_REFERENCED_ROW_2: '23503',
              ER_ROW_IS_REFERENCED_2: '23503',
              ER_TABLEACCESS_DENIED_ERROR: '42501',
              ER_DBACCESS_DENIED_ERROR: '42501',
            } as Record<string, string>
          )[code] ?? code,
      });
    }
  }
  release(destroy = false) {
    if (this.released) return;
    this.released = true;
    if (destroy) {
      this.native.destroy();
      return;
    }
    void this.native
      .query('SELECT RELEASE_ALL_LOCKS()')
      .then(() => this.native.release())
      .catch(() => this.native.destroy());
  }
  on(event: 'error', listener: (error: Error) => void) {
    return this.native.on(event, listener);
  }
  off(event: 'error', listener: (error: Error) => void) {
    return this.native.off(event, listener);
  }
}
class MySqlPool implements SqlPool {
  readonly native: mysql.Pool;
  constructor(
    private readonly config: PostgreSqlConfig,
    private readonly engine: 'mysql' | 'mariadb',
    max: number,
  ) {
    this.native = mysql.createPool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      connectionLimit: max,
      connectTimeout: 2000,
      waitForConnections: false,
      multipleStatements: false,
      timezone: 'Z',
      dateStrings: true,
      decimalNumbers: true,
      charset: 'utf8mb4_bin',
    });
  }
  async connect() {
    const native = await this.native.getConnection();
    try {
      await native.query({ sql: "SET time_zone='+00:00'", timeout: 2000 });
      return new MySqlClient(native, this.config.database, this.engine);
    } catch (error) {
      native.destroy();
      throw error;
    }
  }
  end() {
    return this.native.end();
  }
}
/** Adaptateur complet du Core ; dépôts partagés, verrous et migrations natifs à ce moteur. */
export class MySqlDatabase {
  readonly platform: PlatformRepository;
  readonly jobs: JobRepository;
  private readonly pool: MySqlPool;
  private readonly jobPool: MySqlPool;
  readonly engine: 'mysql' | 'mariadb';
  constructor(config: PostgreSqlConfig) {
    if (!/^[a-z][a-z0-9_]{0,63}$/u.test(config.database)) throw new Error('Nom de base invalide.');
    this.engine = config.engine === 'mariadb' ? 'mariadb' : 'mysql';
    this.pool = new MySqlPool(config, this.engine, 5);
    this.jobPool = new MySqlPool(config, this.engine, 2);
    this.platform = new PlatformRepository(this.pool);
    this.jobs = new JobRepository(this.jobPool);
  }
  async isReady() {
    let client: PoolConnection | undefined;
    try {
      client = await this.pool.native.getConnection();
      return (
        (await this.matchesEngine(client)) && (await mysqlSchemaIsCurrent(client, this.engine))
      );
    } catch {
      client?.destroy();
      client = undefined;
      return false;
    } finally {
      client?.release();
    }
  }
  async migrate() {
    const client = await this.pool.native.getConnection();
    try {
      if (!(await this.matchesEngine(client))) throw new Error('Moteur SQL incompatible.');
      await client.query({ sql: "SET time_zone='+00:00'", timeout: 2000 });
      return await applyMySqlMigrations(client, this.engine);
    } finally {
      client.release();
    }
  }
  private async matchesEngine(client: PoolConnection) {
    const [rows] = await client.query<RowDataPacket[]>({
      sql: 'SELECT VERSION() AS version',
      timeout: 2000,
    });
    const version = String(rows[0]?.version ?? '');
    return this.engine === 'mariadb'
      ? /^11\.4\./u.test(version) && version.includes('MariaDB')
      : /^8\.4\./u.test(version) && !version.includes('MariaDB');
  }
  moduleAdapter(owner: ModuleDataOwner) {
    return new SqlModuleAdapter(this.pool, owner, this.engine);
  }
  async close() {
    await Promise.all([this.pool.end(), this.jobPool.end()]);
  }
}
