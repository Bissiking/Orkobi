import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { PostgreSqlConfig } from '@orkobi/database';
import { HealthController } from './health.controller.js';
import { CoreServicesModule } from './services/services.module.js';
import { localPlatformConfig } from './platform/config.js';
import type { PlatformConfig } from './platform/config.js';
import type { JobConfig } from './jobs/config.js';
import type { CacheConfig } from './cache/service.js';

@Module({ controllers: [HealthController] })
export class AppModule {
  static register(
    database?: PostgreSqlConfig,
    platform: PlatformConfig = localPlatformConfig,
    jobs?: JobConfig,
    cache?: CacheConfig,
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [CoreServicesModule.register(database, platform, jobs, cache)],
    };
  }
}
