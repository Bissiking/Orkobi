import {
  Controller,
  Get,
  Post,
  Inject,
  Req,
  Res,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { BffConfig } from './config.js';

export const BFF_PLATFORM_CONFIG = Symbol('BFF_PLATFORM_CONFIG');
const moduleId = '[a-z][a-z0-9]*(?:\\.[a-z][a-z0-9]*)+';
const pathPattern = new RegExp(
  `^(?:status|session|setup|login|logout|profile|sessions(?:/revoke)?|capabilities|modules(?:/(?:${moduleId})(?:/(?:activate|deactivate|data(?:/[a-z][a-z0-9_]*(?:/[a-f0-9-]{36}(?:/delete)?)?)?))?)?|organizations(?:/[a-f0-9-]{36}(?:/(?:select|members|roles|audit))?)?|admin/(?:users(?:/[a-f0-9-]{36})?|organizations(?:/[a-f0-9-]{36}(?:/(?:members|roles))?)?|modules(?:/${moduleId})?|audit))$`,
  'u',
);

@Controller('api/platform')
export class BffPlatformController {
  constructor(@Inject(BFF_PLATFORM_CONFIG) private readonly config: BffConfig) {}
  @Get('{*path}')
  read(@Req() request: Request, @Res() response: Response) {
    return this.forward('GET', request, response);
  }
  @Post('{*path}')
  write(@Req() request: Request, @Res() response: Response) {
    const origin = this.config.publicOrigin ?? `http://${request.headers.host}`;
    if (
      request.headers.origin !== origin ||
      request.headers['x-orkobi-request'] !== '1' ||
      !request.is('application/json') ||
      request.headers['sec-fetch-site'] === 'cross-site'
    )
      throw new ForbiddenException();
    return this.forward('POST', request, response);
  }
  private async forward(method: 'GET' | 'POST', request: Request, response: Response) {
    const path = request.path.slice('/api/platform/'.length);
    if (!pathPattern.test(path)) throw new NotFoundException();
    const headers: Record<string, string> = { accept: 'application/json' };
    // Liste fermée : aucun Authorization, cookie tiers, Host ou X-Forwarded-* utilisateur.
    const sessionCookies = (request.headers.cookie ?? '')
      .split(';')
      .map((cookie) => cookie.trim())
      .filter((cookie) => /^(?:orkobi\.local|__Host-orkobi)=[a-f0-9]{64}$/u.test(cookie));
    if (sessionCookies.length) headers.cookie = sessionCookies.join('; ');
    if (method === 'POST') {
      headers['content-type'] = 'application/json';
      headers['x-orkobi-request'] = '1';
      if (typeof request.headers['x-csrf-token'] === 'string')
        headers['x-csrf-token'] = request.headers['x-csrf-token'];
    }
    try {
      const upstream = await fetch(new URL(`/platform/${path}`, this.config.coreUrl), {
        method,
        headers,
        ...(method === 'POST' ? { body: JSON.stringify(request.body) } : {}),
        signal: AbortSignal.timeout(this.config.coreTimeoutMs),
        redirect: 'error',
      });
      if (upstream.headers.get('content-type')?.split(';')[0] !== 'application/json')
        throw new Error();
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
      const payload: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!upstream.ok) {
        // Le BFF conserve sa propre corrélation et son filtre d'erreurs expurgé.
        const { HttpException } = await import('@nestjs/common');
        throw new HttpException(
          'Opération refusée.',
          [400, 401, 403, 404, 409, 429, 503].includes(upstream.status) ? upstream.status : 503,
        );
      }
      const cookies = upstream.headers
        .getSetCookie()
        .filter((cookie) => /^(?:orkobi\.local|__Host-orkobi)=/u.test(cookie));
      if (cookies.length) response.setHeader('set-cookie', cookies);
      response.status(upstream.status).json(payload);
    } catch (error) {
      const { HttpException } = await import('@nestjs/common');
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException();
    }
  }
}
