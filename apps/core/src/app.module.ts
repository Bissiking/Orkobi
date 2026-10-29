import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { PostgreSqlConfig } from '@orkobi/database';
import { CoreDatabase, DATABASE_CONFIG } from './database.service.js';
import { HealthController } from './health.controller.js';
import { CoreServicesModule } from './services/services.module.js';

@Module({ imports: [CoreServicesModule], controllers: [HealthController] })
export class AppModule {
  static register(database?: PostgreSqlConfig): DynamicModule {
    return {
      module: AppModule,
      providers: [CoreDatabase, { provide: DATABASE_CONFIG, useValue: database }],
    };
  }
}
