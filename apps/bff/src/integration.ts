import {
  Controller,
  Get,
  HttpException,
  Inject,
  NotFoundException,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { BFF_PLATFORM_CONFIG } from './platform.js';
import type { BffConfig } from './config.js';

/** API Bearer distincte des routes navigateur : aucune session ni cookie relayé. */
@Controller('api/integration')
export class BffIntegrationController {
  constructor(@Inject(BFF_PLATFORM_CONFIG) private readonly config: BffConfig) {}
  @Get('{*path}')
  async read(@Req() request: Request, @Res() response: Response) {
    const path = request.path.slice('/api/integration/'.length);
    if (!/^organizations(?:\/[a-f0-9-]{36}(?:\/(?:modules|audit))?)?$/u.test(path))
      throw new NotFoundException();
    try {
      const upstream = await fetch(new URL(`/integration/${path}`, this.config.coreUrl), {
        headers: {
          accept: 'application/json',
          authorization: request.headers.authorization ?? '',
          ...(this.config.internalToken ? { 'x-orkobi-internal': this.config.internalToken } : {}),
        },
        redirect: 'error',
        signal: AbortSignal.timeout(this.config.coreTimeoutMs),
      });
      if (upstream.headers.get('content-type')?.split(';')[0] !== 'application/json') {
        await upstream.body?.cancel();
        throw new Error();
      }
      const reader = upstream.body?.getReader();
      if (!reader) throw new Error();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 524288) {
          await reader.cancel();
          throw new Error();
        }
        chunks.push(value);
      }
      const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!upstream.ok)
        throw new HttpException(
          'Opération refusée.',
          [400, 401, 403, 404, 429, 503].includes(upstream.status) ? upstream.status : 503,
        );
      response.status(200).json(data);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException();
    }
  }
}
