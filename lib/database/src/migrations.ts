import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { platformMigration } from './platform-migration.js';
import { modulesMigration } from './modules-migration.js';
import { moduleDemoMigration } from './module-demo-migration.js';

export interface Migration {
  readonly id: string;
  readonly sql: string;
  /** Identifiant du module propriétaire, pour les migrations propres aux modules. */
  readonly module?: string;
}

/** Migrations append-only ; ne jamais modifier une migration déjà appliquée. */
export const migrations: readonly Migration[] = Object.freeze([
  Object.freeze({
    id: '0001_core_schema',
    sql: 'CREATE SCHEMA orkobi_core;',
  }),
  Object.freeze(platformMigration),
  Object.freeze(modulesMigration),
  Object.freeze(moduleDemoMigration),
]);

/** Sous-ensemble des migrations appartenant à un module officiel. */
export function migrationsForModule(moduleId: string): readonly Migration[] {
  return migrations.filter((migration) => migration.module === moduleId);
}

export function checksum(migration: Migration): string {
  return createHash('sha256').update(migration.sql).digest('hex');
}

interface AppliedMigration {
  id: string;
  checksum: string;
}

function validateHistory(rows: AppliedMigration[], expected: readonly Migration[]) {
  for (const [index, row] of rows.entries()) {
    const migration = expected[index];
    if (!migration || row.id !== migration.id || row.checksum !== checksum(migration)) {
      throw new Error('Historique des migrations incompatible.');
    }
  }
}

export async function schemaIsCurrent(client: PoolClient): Promise<boolean> {
  const result = await client.query<AppliedMigration>(
    'SELECT id, checksum FROM orkobi_infrastructure.schema_migrations ORDER BY id',
  );
  validateHistory(result.rows, migrations);
  return result.rows.length === migrations.length;
}

/** Une transaction pour le lot entier, verrou partagé par tous les runners Orkobi. */
export async function applyMigrations(
  client: PoolClient,
  expected: readonly Migration[] = migrations,
): Promise<string[]> {
  if (
    expected.some(
      (migration, index) =>
        !/^\d{4}_[a-z0-9_]+$/u.test(migration.id) ||
        (index > 0 && migration.id <= expected[index - 1]!.id),
    )
  )
    throw new Error('Ordre des migrations invalide.');
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query('SELECT pg_advisory_xact_lock(1869769583, 1)');
    await client.query('CREATE SCHEMA IF NOT EXISTS orkobi_infrastructure');
    await client.query(`CREATE TABLE IF NOT EXISTS orkobi_infrastructure.schema_migrations (
      id text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const result = await client.query<AppliedMigration>(
      'SELECT id, checksum FROM orkobi_infrastructure.schema_migrations ORDER BY id',
    );
    validateHistory(result.rows, expected);
    const applied: string[] = [];
    for (const migration of expected.slice(result.rows.length)) {
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO orkobi_infrastructure.schema_migrations (id, checksum) VALUES ($1, $2)',
        [migration.id, checksum(migration)],
      );
      applied.push(migration.id);
    }
    // Le compte d'exécution peut lire l'état, mais ne peut ni migrer ni modifier le registre.
    await client.query('GRANT USAGE ON SCHEMA orkobi_infrastructure TO orkobi_app');
    await client.query('GRANT SELECT ON orkobi_infrastructure.schema_migrations TO orkobi_app');
    await client.query('COMMIT');
    return applied;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
