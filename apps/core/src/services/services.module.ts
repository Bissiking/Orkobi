import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { PostgreSqlConfig } from '@orkobi/database';
import { CoreDatabase, DATABASE_CONFIG } from '../database.service.js';
import { PlatformController } from '../platform/controller.js';
import { PlatformService } from '../platform/service.js';
import { AdvancedIdentityService } from '../platform/identity.js';
import { IntegrationAccessService, IntegrationController } from '../platform/integration.js';
import { PLATFORM_CONFIG, localPlatformConfig } from '../platform/config.js';
import type { PlatformConfig } from '../platform/config.js';
import { CapabilityRegistry } from '../modules/capability-registry.js';
import { ModuleManager } from '../modules/manager.js';
import { ModuleDataService } from '../modules/data.js';
import { PersistentCoreServices } from './persistent-services.js';
import {
  CORE_CAPABILITIES,
  CORE_IDENTITY,
  CORE_ORGANIZATIONS,
  CORE_PERMISSIONS,
} from './contracts.js';
import { CoreSdkFactory } from './sdk-factory.js';
import { UnavailableCoreServices } from './unavailable-services.js';
import { JobEngine } from '../jobs/service.js';
import { JobRegistry } from '../jobs/registry.js';
import { JOB_CONFIG, defaultJobConfig } from '../jobs/config.js';
import type { JobConfig } from '../jobs/config.js';
import { TechnicalCache, CACHE_CONFIG } from '../cache/service.js';
import type { CacheConfig } from '../cache/service.js';

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
    jobs: JobConfig = defaultJobConfig,
    cache: CacheConfig = { redisUrl: undefined },
  ): DynamicModule {
    return {
      module: CoreServicesModule,
      controllers: [PlatformController, IntegrationController],
      providers: [
        CoreDatabase,
        PlatformService,
        AdvancedIdentityService,
        IntegrationAccessService,
        PersistentCoreServices,
        CapabilityRegistry,
        ModuleManager,
        ModuleDataService,
        JobEngine,
        JobRegistry,
        TechnicalCache,
        { provide: JOB_CONFIG, useValue: jobs },
        { provide: CACHE_CONFIG, useValue: cache },
        { provide: DATABASE_CONFIG, useValue: database },
        { provide: PLATFORM_CONFIG, useValue: platform },
        ...[CORE_IDENTITY, CORE_ORGANIZATIONS, CORE_PERMISSIONS].map((provide) => ({
          provide,
          useExisting: PersistentCoreServices,
        })),
        { provide: CORE_CAPABILITIES, useExisting: CapabilityRegistry },
      ],
      exports: [CoreDatabase],
    };
  }
}
