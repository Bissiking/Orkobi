import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { PostgreSqlDatabase } from '@orkobi/database';
import type { PostgreSqlConfig } from '@orkobi/database';

export const DATABASE_CONFIG = Symbol('DATABASE_CONFIG');

@Injectable()
export class CoreDatabase implements OnApplicationShutdown {
  readonly #database: PostgreSqlDatabase | undefined;

  constructor(@Inject(DATABASE_CONFIG) config: PostgreSqlConfig | undefined) {
    this.#database = config ? new PostgreSqlDatabase(config) : undefined;
  }

  async isReady(): Promise<boolean> {
    return this.#database ? this.#database.isReady() : false;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.#database?.close();
  }
}
