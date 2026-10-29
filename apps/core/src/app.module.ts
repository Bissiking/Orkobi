import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { CoreServicesModule } from './services/services.module.js';

@Module({ imports: [CoreServicesModule], controllers: [HealthController] })
export class AppModule {}
