import type { Pool, PoolClient } from 'pg';
import type { OrganizationContext } from '@orkobi/contracts';
import type {
  DatabaseTransaction,
  PostgreSqlAdapter,
  QueryResult,
  SqlStatement,
  TransactionOptions,
} from './index.js';

/** Tables détenues par un module, déclarées dans son manifeste. */
export interface ModuleDataOwner {
  readonly moduleId: string;
  readonly tables: readonly string[];
}

/** Refus d'une opération SQL de module ; jamais de détail SQL dans le message public. */
export class ModuleDataError extends Error {
  constructor() {
    super('Opération de données refusée.');
    this.name = 'ModuleDataError';
  }
}

const identifier = '[a-z_][a-z0-9_]*';
const columns = `${identifier}(?:\\s*,\\s*${identifier})*`;
const table = `${identifier}\\.${identifier}`;
const binding = `${identifier}\\s*=\\s*\\$[1-9][0-9]*`;
const where = `${binding}(?:\\s+AND\\s+${binding})*`;
const returning = `(?:\\s+RETURNING\\s+(${columns}))?`;
const select = new RegExp(
  `^SELECT\\s+(?:\\*|${columns})\\s+FROM\\s+(${table})\\s+WHERE\\s+(${where})(?:\\s+ORDER\\s+BY\\s+${identifier}(?:\\s+(?:ASC|DESC))?(?:\\s*,\\s*${identifier}(?:\\s+(?:ASC|DESC))?)*)?(?:\\s+LIMIT\\s+[1-9][0-9]*)?$`,
  'iu',
);
const insert = new RegExp(
  `^INSERT\\s+INTO\\s+(${table})\\s*\\((${columns})\\)\\s+VALUES\\s*\\((\\$[1-9][0-9]*(?:\\s*,\\s*\\$[1-9][0-9]*)*)\\)${returning}$`,
  'iu',
);
const assignment = `${identifier}\\s*=\\s*(?:\\$[1-9][0-9]*|now\\(\\))`;
const update = new RegExp(
  `^UPDATE\\s+(${table})\\s+SET\\s+(${assignment}(?:\\s*,\\s*${assignment})*)\\s+WHERE\\s+(${where})${returning}$`,
  'iu',
);
const remove = new RegExp(`^DELETE\\s+FROM\\s+(${table})\\s+WHERE\\s+(${where})$`, 'iu');
const ownedTable = /^orkobi_(?!core\.|infrastructure\.)[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/u;

/**
 * Sous-ensemble SQL fermé : CRUD sur une seule table, valeurs liées, conditions
 * d'égalité conjointes. Ni jointure, sous-requête, expression libre ni commentaire.
 */
export function validateModuleStatement(
  owner: ModuleDataOwner,
  statement: SqlStatement,
  organizationId?: string,
) {
  const text = statement.text.trim();
  if (!text) throw new ModuleDataError();
  const body = text.replace(/;\s*$/u, '');
  if (body.includes(';')) throw new ModuleDataError();
  const parameterIndexes = [...body.matchAll(/\$([0-9]+)/gu)].map((match) => Number(match[1]));
  if (parameterIndexes.some((index) => index < 1 || index > statement.parameters.length))
    throw new ModuleDataError();
  const read = select.exec(body),
    create = insert.exec(body),
    change = update.exec(body),
    deletion = remove.exec(body);
  const match = read ?? create ?? change ?? deletion;
  if (
    !match ||
    !owner.tables.includes(match[1]!.toLowerCase()) ||
    !ownedTable.test(match[1]!.toLowerCase())
  )
    throw new ModuleDataError();
  let organizationParameter: number | undefined;
  if (create) {
    const names = create[2]!.toLowerCase().split(/\s*,\s*/u);
    const values = create[3]!.split(/\s*,\s*/u);
    if (new Set(names).size !== names.length || names.length !== values.length)
      throw new ModuleDataError();
    const index = names.indexOf('organization_id');
    if (index >= 0) organizationParameter = Number(values[index]!.slice(1));
  } else {
    if (change && /(?:^|,)\s*organization_id\s*=/iu.test(change[2]!)) throw new ModuleDataError();
    const conditions = read?.[2] ?? change?.[3] ?? deletion![2]!;
    const organization =
      /(?:^|\s+AND\s+)organization_id\s*=\s*\$([1-9][0-9]*)(?:\s+AND\s+|$)/iu.exec(conditions);
    if (organization) organizationParameter = Number(organization[1]);
  }
  if (
    organizationParameter === undefined ||
    (organizationId !== undefined &&
      statement.parameters[organizationParameter - 1] !== organizationId)
  )
    throw new ModuleDataError();
}

/** Façade bornée réutilisable dans une transaction Core déjà ouverte. */
export async function moduleTransaction(
  client: PoolClient,
  owner: ModuleDataOwner,
  context: OrganizationContext,
): Promise<DatabaseTransaction> {
  await client.query("SELECT set_config('orkobi.organization_id', $1, true)", [
    context.organizationId,
  ]);
  return {
    organizationId: context.organizationId,
    execute: async <Row extends object>(statement: SqlStatement): Promise<QueryResult<Row>> => {
      validateModuleStatement(owner, statement, context.organizationId);
      const result = await client.query<Row>(statement.text, [...statement.parameters]);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    },
  };
}

/** Adaptateur PostgreSQL pour un module : isolation par contexte et SQL paramétré. */
export class PostgreSqlModuleAdapter implements PostgreSqlAdapter {
  readonly dialect = 'postgresql' as const;
  constructor(
    private readonly pool: Pool,
    private readonly owner: ModuleDataOwner,
  ) {}
  async transaction<Value>(
    context: OrganizationContext,
    operation: (transaction: DatabaseTransaction) => Promise<Value>,
    options?: TransactionOptions,
  ): Promise<Value> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (options?.isolationLevel)
        await client.query(
          `SET TRANSACTION ISOLATION LEVEL ${options.isolationLevel.toUpperCase()}`,
        );
      if (options?.readOnly) await client.query('SET TRANSACTION READ ONLY');
      await client.query("SET LOCAL lock_timeout = '2s'");
      const transaction = await moduleTransaction(client, this.owner, context);
      const value = await operation(transaction);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
