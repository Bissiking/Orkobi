import pg from 'pg';
import type { PostgreSqlConfig } from './config.js';
import { applyMigrations, schemaIsCurrent } from './migrations.js';
import { PlatformRepository } from './platform.js';
import { JobRepository } from './jobs.js';
import { PostgreSqlModuleAdapter } from './adapter.js';
import type { ModuleDataOwner } from './adapter.js';
import type { PostgreSqlAdapter } from './index.js';

/** Infrastructure interne, sans accès SQL public ni promesse d'isolation métier. */
export class PostgreSqlDatabase {
  readonly engine = 'postgresql' as const;
  readonly #pool: pg.Pool;
  readonly platform: PlatformRepository;
  readonly jobs: JobRepository;
  readonly #jobPool: pg.Pool;

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
    this.platform = new PlatformRepository(this.#pool);
    this.#jobPool = new pg.Pool({
      ...config,
      max: 2,
      connectionTimeoutMillis: 2000,
      statement_timeout: 2000,
      application_name: 'orkobi-jobs',
      ssl: false,
    });
    this.#jobPool.on('error', () => {});
    this.jobs = new JobRepository(this.#jobPool);
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

  /** Accès SQL borné aux tables déclarées du module, isolé par organisation. */
  moduleAdapter(owner: ModuleDataOwner): PostgreSqlAdapter {
    return new PostgreSqlModuleAdapter(this.#pool, owner);
  }

  async close(): Promise<void> {
    await Promise.all([this.#pool.end(), this.#jobPool.end()]);
  }
}
