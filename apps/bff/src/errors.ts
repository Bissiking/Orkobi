import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { CoreError, ErrorCode } from '@orkobi/contracts';
import type { Response } from 'express';
import type { JsonLogger } from './logger.js';

const messages: Readonly<Record<number, readonly [ErrorCode, string]>> = {
  400: ['invalid_argument', 'Requête invalide.'],
  404: ['not_found', 'Ressource introuvable.'],
  413: ['invalid_argument', 'Requête trop volumineuse.'],
  503: ['unavailable', 'Service temporairement indisponible.'],
};

@Catch()
export class BffExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: JsonLogger) {}
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const [code, message] = messages[status] ?? ['internal_error', 'Erreur interne du serveur.'];
    const correlationId = String(response.locals.correlationId);
    const error: CoreError = { code, message, correlationId };
    this.logger.event(status >= 500 ? 'error' : 'warn', 'http_error', {
      status,
      code,
      correlationId,
    });
    if (!response.headersSent) response.status(status).json({ error });
  }
}
