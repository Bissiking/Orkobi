import { Controller, Get } from '@nestjs/common';
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
  @Get()
  @ApiOperation({ summary: 'Vitalité du processus Core, sans vérification SQL.' })
  @ApiOkResponse({ type: HealthResponse })
  health(): HealthResponse {
    return new HealthResponse();
  }
}
