import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  Controller,
  Get,
  Inject,
  Module,
  NotFoundException,
  Res,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import type { BffBootstrap } from '@orkobi/contracts';
import { productVersion } from './config.js';
import type { BffConfig } from './config.js';
import { probeCore } from './core-client.js';
import { JsonLogger } from './logger.js';
import { BffExceptionFilter } from './errors.js';

const CONFIG = Symbol('BFF_CONFIG');
const WEB_ROOT = Symbol('WEB_ROOT');

@Controller('api')
class ApiController {
  constructor(@Inject(CONFIG) private readonly config: BffConfig) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'orkobi-bff' } as const;
  }

  @Get('bootstrap')
  async bootstrap(@Res({ passthrough: true }) response: Response): Promise<BffBootstrap> {
    const core = await probeCore(this.config, String(response.locals.correlationId));
    return {
      schemaVersion: 1,
      product: { name: 'Orkobi', version: productVersion },
      core,
      features: { identity: 'unavailable', organizations: 'unavailable', modules: 'unavailable' },
      checkedAt: new Date().toISOString(),
    };
  }
}

@Controller()
class WebController {
  constructor(@Inject(WEB_ROOT) private readonly webRoot: string) {}

  @Get('{*path}')
  index(@Req() request: Request, @Res() response: Response): Promise<void> {
    // Les routes API inconnues et les fichiers absents ne deviennent jamais du HTML.
    if (request.path === '/api' || request.path.startsWith('/api/') || request.path.includes('.')) {
      throw new NotFoundException();
    }
    return new Promise((resolve, reject) => {
      response.sendFile('index.html', { root: this.webRoot }, (error) => {
        if (error) reject(new ServiceUnavailableException());
        else resolve();
      });
    });
  }
}

export async function createBffApplication(
  config: BffConfig,
  logger = new JsonLogger(),
  webRoot = fileURLToPath(new URL('../../web/dist/', import.meta.url)),
) {
  @Module({
    controllers: [ApiController, WebController],
    providers: [
      { provide: CONFIG, useValue: config },
      { provide: WEB_ROOT, useValue: webRoot },
    ],
  })
  class BffModule {}
  const app = await NestFactory.create<NestExpressApplication>(BffModule, {
    logger,
    abortOnError: false,
    bodyParser: false,
  });
  app.useSecurityHeaders({
    strictTransportSecurity: false,
    contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const correlationId = randomUUID();
    const started = performance.now();
    response.locals.correlationId = correlationId;
    response.setHeader('x-request-id', correlationId);
    response.setHeader('cache-control', 'no-store');
    response.once('finish', () =>
      logger.event('info', 'http_request', {
        method: request.method,
        status: response.statusCode,
        durationMs: Math.round(performance.now() - started),
        correlationId,
      }),
    );
    next();
  });
  app.useBodyParser('json', { limit: '100kb' });
  app.useGlobalFilters(new BffExceptionFilter(logger));
  app.useStaticAssets(webRoot, {
    index: false,
    dotfiles: 'deny',
    redirect: false,
    setHeaders: (response) => response.setHeader('Cache-Control', 'no-store'),
  });
  return app;
}
