import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { PostgreSqlConfig } from '@orkobi/database';
import { HealthController } from './health.controller.js';
import { CoreServicesModule } from './services/services.module.js';
import { localPlatformConfig } from './platform/config.js';
import type { PlatformConfig } from './platform/config.js';

@Module({ controllers: [HealthController] })
export class AppModule {
  static register(
    database?: PostgreSqlConfig,
    platform: PlatformConfig = localPlatformConfig,
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [CoreServicesModule.register(database, platform)],
    };
  }
}
