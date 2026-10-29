import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { CoreDatabase } from './database.service.js';
import type { CoreHealth } from '@orkobi/contracts';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';

export class HealthResponse implements CoreHealth {
  @ApiProperty({ enum: ['ok'] })
  readonly status = 'ok' as const;

  @ApiProperty({ enum: ['orkobi-core'] })
  readonly service = 'orkobi-core' as const;
}

@ApiTags('system')
@Controller('health')
export class HealthController {
  constructor(@Inject(CoreDatabase) private readonly database: CoreDatabase) {}

  @Get('ready')
  @ApiOperation({
    summary: 'Disponibilité PostgreSQL et migrations à jour, sans préparation métier.',
  })
  @ApiOkResponse({ type: HealthResponse })
  async ready(): Promise<HealthResponse> {
    if (!(await this.database.isReady())) throw new ServiceUnavailableException();
    return new HealthResponse();
  }

  @Get()
  @ApiOperation({ summary: 'Vitalité du processus Core, sans vérification SQL.' })
  @ApiOkResponse({ type: HealthResponse })
  health(): HealthResponse {
    return new HealthResponse();
  }
}
