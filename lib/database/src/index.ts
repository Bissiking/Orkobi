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
  StoredModule,
} from './platform.js';
export { PostgreSqlModuleAdapter, ModuleDataError, validateModuleStatement } from './adapter.js';
export type { ModuleDataOwner } from './adapter.js';
export { migrations, migrationsForModule, checksum } from './migrations.js';
export type { Migration } from './migrations.js';

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

/** Exécute les opérations dans une transaction réelle, avec commit ou rollback. */
export interface DatabaseAdapter {
  transaction<Value>(
    context: OrganizationContext,
    operation: (transaction: DatabaseTransaction) => Promise<Value>,
    options?: TransactionOptions,
  ): Promise<Value>;
}

/** Adaptateur PostgreSQL ; le Core fournit une façade bornée par module. */
export interface PostgreSqlAdapter extends DatabaseAdapter {
  readonly dialect: 'postgresql';
}
