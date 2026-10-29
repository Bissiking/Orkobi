import pg from 'pg';
import type { PostgreSqlConfig } from './config.js';
import { applyMigrations, schemaIsCurrent } from './migrations.js';

/** Infrastructure interne, sans accès SQL public ni promesse d'isolation métier. */
export class PostgreSqlDatabase {
  readonly #pool: pg.Pool;

  constructor(config: PostgreSqlConfig) {
    this.#pool = new pg.Pool({
      ...config,
      max: 5,
      connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 10000,
      statement_timeout: 2000,
      query_timeout: 16000,
      application_name: 'orkobi',
      // Le transport de cette étape est limité au réseau Docker/local.
      ssl: false,
    });
    // Une déconnexion d'un client inactif ne doit pas arrêter le processus HTTP.
    this.#pool.on('error', () => {});
  }

  async isReady(): Promise<boolean> {
    try {
      const client = await this.#pool.connect();
      try {
        return await schemaIsCurrent(client);
      } finally {
        client.release();
      }
    } catch {
      return false;
    }
  }

  async migrate(): Promise<readonly string[]> {
    const client = await this.#pool.connect();
    try {
      return await applyMigrations(client);
    } finally {
      client.release();
    }
  }

  close(): Promise<void> {
    return this.#pool.end();
  }
}
