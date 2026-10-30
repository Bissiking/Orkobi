import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { PostgreSqlConfig } from '@orkobi/database';
import { CoreDatabase, DATABASE_CONFIG } from '../database.service.js';
import { PlatformController } from '../platform/controller.js';
import { PlatformService } from '../platform/service.js';
import { PLATFORM_CONFIG, localPlatformConfig } from '../platform/config.js';
import type { PlatformConfig } from '../platform/config.js';
import { PersistentCoreServices } from './persistent-services.js';
import {
  CORE_CAPABILITIES,
  CORE_IDENTITY,
  CORE_ORGANIZATIONS,
  CORE_PERMISSIONS,
} from './contracts.js';
import { CoreSdkFactory } from './sdk-factory.js';
import { UnavailableCoreServices } from './unavailable-services.js';

const tokens = [CORE_IDENTITY, CORE_ORGANIZATIONS, CORE_PERMISSIONS, CORE_CAPABILITIES];

@Module({
  providers: [
    UnavailableCoreServices,
    ...tokens.map((provide) => ({ provide, useExisting: UnavailableCoreServices })),
    CoreSdkFactory,
  ],
  exports: [...tokens, CoreSdkFactory],
})
export class CoreServicesModule {
  static register(
    database?: PostgreSqlConfig,
    platform: PlatformConfig = localPlatformConfig,
  ): DynamicModule {
    return {
      module: CoreServicesModule,
      controllers: [PlatformController],
      providers: [
        CoreDatabase,
        PlatformService,
        PersistentCoreServices,
        { provide: DATABASE_CONFIG, useValue: database },
        { provide: PLATFORM_CONFIG, useValue: platform },
        ...[CORE_IDENTITY, CORE_ORGANIZATIONS, CORE_PERMISSIONS].map((provide) => ({
          provide,
          useExisting: PersistentCoreServices,
        })),
      ],
      exports: [CoreDatabase],
    };
  }
}
