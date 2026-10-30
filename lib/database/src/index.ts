// lib/database/src/index.ts
import type { OrganizationContext, OrganizationId } from '@orkobi/contracts';

export { DatabaseConfigurationError, loadDatabaseConfig } from './config.js';
export type { PostgreSqlConfig } from './config.js';
export { PostgreSqlDatabase } from './postgres.js';
export type {
  PlatformRepository,
  PlatformTransaction,
  CredentialUser,
  StoredSession,
} from './platform.js';

export type SqlParameter = string | number | boolean | bigint | Date | Uint8Array | null;

/** SQL interne uniquement ; les valeurs doivent être liées via parameters. */
export interface SqlStatement {
  readonly text: string;
  readonly parameters: readonly SqlParameter[];
}

export interface QueryResult<Row> {
  readonly rows: readonly Row[];
  readonly rowCount: number;
}

export interface TransactionOptions {
  readonly isolationLevel?: 'read committed' | 'repeatable read' | 'serializable';
  readonly readOnly?: boolean;
}

export interface DatabaseTransaction {
  readonly organizationId: OrganizationId;
  execute<Row extends object>(statement: SqlStatement): Promise<QueryResult<Row>>;
}

/** L'adaptateur futur doit appliquer l'isolation, commit et rollback réels. */
export interface DatabaseAdapter {
  transaction<Value>(
    context: OrganizationContext,
    operation: (transaction: DatabaseTransaction) => Promise<Value>,
    options?: TransactionOptions,
  ): Promise<Value>;
}

/** Point d'extension, sans connexion ni pilote PostgreSQL à ce stade. */
export interface PostgreSqlAdapter extends DatabaseAdapter {
  readonly dialect: 'postgresql';
}
