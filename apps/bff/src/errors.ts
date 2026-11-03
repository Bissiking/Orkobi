import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { publicHttpError, publicBusinessDetails } from '@orkobi/contracts';
import type { Response } from 'express';
import type { JsonLogger } from './logger.js';

@Catch()
export class BffExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: JsonLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const correlationId = String(response.locals.correlationId);
    const { error, logLevel } = publicHttpError(status, correlationId);
    this.logger.event(logLevel, 'http_error', { status, code: error.code, correlationId });
    const details =
      exception instanceof HttpException ? publicBusinessDetails(exception.getResponse()) : null;
    if (!response.headersSent) response.status(status).json({ error: { ...error, ...details } });
  }
}
