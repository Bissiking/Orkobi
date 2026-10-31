import {
  Controller,
  Get,
  Post,
  HttpCode,
  Inject,
  Req,
  Res,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PlatformService, equal } from './service.js';
import { PLATFORM_CONFIG } from './config.js';
import type { PlatformConfig } from './config.js';

@Controller('platform')
export class PlatformController {
  constructor(
    @Inject(PlatformService) private readonly platform: PlatformService,
    @Inject(PLATFORM_CONFIG) private readonly config: PlatformConfig,
  ) {}

  @Get('{*path}')
  read(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.handle('GET', request, response);
  }
  @Post('{*path}')
  @HttpCode(200)
  write(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    if (request.headers['x-orkobi-request'] !== '1' || !request.is('application/json'))
      throw new ForbiddenException();
    return this.handle('POST', request, response);
  }
  private async handle(method: 'GET' | 'POST', request: Request, response: Response) {
    // Authentification interne BFF ↔ Core ; active uniquement si INTERNAL_TOKEN est configuré.
    if (
      this.config.internalToken &&
      !equal(String(request.headers['x-orkobi-internal'] ?? ''), this.config.internalToken)
    )
      throw new ForbiddenException();
    const name = this.config.secureCookies ? '__Host-orkobi' : 'orkobi.local';
    const oidcName = this.config.secureCookies ? '__Host-orkobi-oidc' : 'orkobi.oidc';
    const oidcCookies = (request.headers.cookie ?? '')
      .split(';')
      .map((value) => value.trim())
      .filter((value) => value.startsWith(`${oidcName}=`));
    const cookies = (request.headers.cookie ?? '')
      .split(';')
      .map((cookie) => cookie.trim())
      .filter((cookie) => cookie.startsWith(`${name}=`));
    const token = cookies.length === 1 ? cookies[0]!.slice(name.length + 1) : '';
    const path = request.path.slice('/platform/'.length);
    const agent = request.headers['user-agent'];
    const input = {
      token,
      oidcState: oidcCookies.length === 1 ? oidcCookies[0]!.slice(oidcName.length + 1) : '',
      csrf:
        typeof request.headers['x-csrf-token'] === 'string' ? request.headers['x-csrf-token'] : '',
      userAgent:
        typeof agent === 'string'
          ? [...agent]
              .filter((character) => {
                const code = character.charCodeAt(0);
                return code >= 32 && code !== 127;
              })
              .join('')
              .slice(0, 200) || null
          : null,
      body: request.body as unknown,
    };
    if (
      method === 'POST' &&
      (path === 'admin/users' || /^admin\/users\/[^/]+\/password$/u.test(path))
    )
      input.body = await this.platform.prepareUser(input);
    const result = await this.platform.execute(method, path, input);
    if (
      method === 'POST' &&
      path === 'login' &&
      result.data &&
      typeof result.data === 'object' &&
      'authenticated' in result.data &&
      (result.data as { authenticated?: unknown }).authenticated === false
    )
      throw new UnauthorizedException();
    const cookieOptions = {
      httpOnly: true,
      secure: this.config.secureCookies,
      sameSite: 'strict' as const,
      path: '/',
    };
    if (result.token)
      response.cookie(name, result.token, { ...cookieOptions, maxAge: 8 * 60 * 60 * 1000 });
    if (result.clearCookie) response.clearCookie(name, cookieOptions);
    if (result.oidcState)
      response.cookie(oidcName, result.oidcState, {
        ...cookieOptions,
        sameSite: 'lax',
        maxAge: 10 * 60 * 1000,
      });
    if (result.oidcState === null)
      response.clearCookie(oidcName, { ...cookieOptions, sameSite: 'lax' });
    return result.data;
  }
}
