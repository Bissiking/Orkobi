import { Module } from '@nestjs/common';
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
export class CoreServicesModule {}
