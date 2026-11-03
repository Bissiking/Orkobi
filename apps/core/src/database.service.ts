import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { createDatabase } from '@orkobi/database';
import type {
  ModuleDataOwner,
  DatabaseAdapter,
  PostgreSqlConfig,
  CoreSqlDatabase,
} from '@orkobi/database';

export const DATABASE_CONFIG = Symbol('DATABASE_CONFIG');

@Injectable()
export class CoreDatabase implements OnApplicationShutdown {
  readonly #database: CoreSqlDatabase | undefined;

  constructor(@Inject(DATABASE_CONFIG) config: PostgreSqlConfig | undefined) {
    this.#database = config ? createDatabase(config) : undefined;
  }

  get engine() {
    return this.#database?.engine ?? null;
  }
  async isReady(): Promise<boolean> {
    return this.#database ? this.#database.isReady() : false;
  }

  async repository() {
    if (!this.#database || !(await this.#database.isReady()))
      throw new ServiceUnavailableException();
    return this.#database.platform;
  }
  async jobs() {
    if (!this.#database || !(await this.#database.isReady()))
      throw new ServiceUnavailableException();
    return this.#database.jobs;
  }

  /** Adaptateur Data Access borné aux tables détenues par le module appelant. */
  async dataAdapter(owner: ModuleDataOwner): Promise<DatabaseAdapter> {
    if (!this.#database || !(await this.#database.isReady()))
      throw new ServiceUnavailableException();
    return this.#database.moduleAdapter(owner);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.#database?.close();
  }
}
