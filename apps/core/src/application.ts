import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module.js';
import type { CoreConfig } from './config.js';
import { CoreExceptionFilter } from './errors.js';
import { JsonLogger } from './logger.js';
import { coreVersion } from './version.js';

export async function createApplication(config: CoreConfig, logger = new JsonLogger()) {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register(config.database, config.platform),
    {
      logger,
      abortOnError: false,
      // Le parseur est enregistré après le middleware de corrélation.
      bodyParser: false,
    },
  );
  app.disable('x-powered-by');
  app.useSecurityHeaders({
    // Le transport de ce socle est HTTP local ; la politique TLS relève du déploiement futur.
    strictTransportSecurity: false,
    contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } },
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const correlationId = randomUUID();
    const startedAt = performance.now();
    response.locals.correlationId = correlationId;
    response.setHeader('x-request-id', correlationId);
    response.setHeader('Cache-Control', 'no-store');
    response.once('finish', () => {
      logger.event('info', 'http_request', {
        method: request.method,
        status: response.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
        correlationId,
      });
    });
    next();
  });
  app.useBodyParser('json', { limit: '100kb' });
  app.useGlobalFilters(new CoreExceptionFilter(logger));
  if (config.openApiEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Orkobi Core — API interne')
        .setDescription(
          'Fondations techniques ; vitalité HTTP et disponibilité PostgreSQL, sans authentification métier.',
        )
        .setVersion(coreVersion)
        .build(),
    );
    SwaggerModule.setup('internal/docs', app, document, {
      jsonDocumentUrl: '/internal/openapi.json',
      raw: ['json'],
      swaggerOptions: { validatorUrl: null },
    });
  }
  return app;
}
