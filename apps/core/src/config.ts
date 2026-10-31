import { DatabaseConfigurationError, loadDatabaseConfig } from '@orkobi/database';
import type { PostgreSqlConfig } from '@orkobi/database';
import type { PlatformConfig } from './platform/config.js';
import type { OidcProviderConfig } from './platform/oidc.js';

export interface CoreConfig {
  readonly environment: 'development' | 'test' | 'production';
  readonly host: string;
  readonly port: number;
  readonly openApiEnabled: boolean;
  readonly database?: PostgreSqlConfig;
  readonly platform?: PlatformConfig;
}

export class ConfigurationError extends Error {}

/** L'identifiant issuer conserve son slash final éventuel (comparaison exacte OIDC). */
function issuerUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigurationError('OIDC_ISSUER doit être une origine HTTP ou HTTPS.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new ConfigurationError('OIDC_ISSUER doit être une origine HTTP ou HTTPS.');
  return url.origin + (url.pathname === '/' && !value.endsWith('/') ? '' : url.pathname);
}
function loadOidcConfig(env: NodeJS.ProcessEnv): OidcProviderConfig | null {
  const present = ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_REDIRECT_URI', 'OIDC_CLIENT_SECRET'];
  if (!present.some((key) => !!env[key])) return null;
  if (!env.OIDC_ISSUER || !env.OIDC_CLIENT_ID || !env.OIDC_REDIRECT_URI)
    throw new ConfigurationError(
      'OIDC_ISSUER, OIDC_CLIENT_ID et OIDC_REDIRECT_URI sont requis ensemble.',
    );
  const clientId = env.OIDC_CLIENT_ID;
  if (!clientId.trim() || clientId.trim() !== clientId || clientId.length > 254)
    throw new ConfigurationError('OIDC_CLIENT_ID doit être une chaîne courte sans espaces.');
  let redirect: URL;
  try {
    redirect = new URL(env.OIDC_REDIRECT_URI);
  } catch {
    throw new ConfigurationError('OIDC_REDIRECT_URI doit être une URL HTTP ou HTTPS.');
  }
  if (
    !['http:', 'https:'].includes(redirect.protocol) ||
    redirect.username ||
    redirect.password ||
    redirect.search ||
    redirect.hash
  )
    throw new ConfigurationError('OIDC_REDIRECT_URI doit être une URL HTTP ou HTTPS.');
  const clientSecret = env.OIDC_CLIENT_SECRET ?? '';
  const issuer = issuerUrl(env.OIDC_ISSUER);
  if (
    env.NODE_ENV === 'production' &&
    (redirect.protocol !== 'https:' || new URL(issuer).protocol !== 'https:')
  )
    throw new ConfigurationError('OIDC exige HTTPS en production.');
  if (clientSecret.length > 512) throw new ConfigurationError('OIDC_CLIENT_SECRET est trop long.');
  return Object.freeze({
    issuer,
    clientId,
    clientSecret,
    redirectUri: redirect.toString(),
  });
}

/** Valide avant toute ouverture de port ; les valeurs rejetées ne sont pas affichées. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): CoreConfig {
  const environment = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(environment)) {
    throw new ConfigurationError('NODE_ENV doit être development, test ou production.');
  }
  const host = env.CORE_HOST ?? '127.0.0.1';
  if (!host || host.trim() !== host || /[\s/]/u.test(host)) {
    throw new ConfigurationError('CORE_HOST doit être un nom d’hôte ou une adresse IP.');
  }
  const port = env.CORE_PORT ?? '3001';
  if (!/^\d+$/u.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new ConfigurationError('CORE_PORT doit être un entier entre 1 et 65535.');
  }
  const openApi = env.CORE_OPENAPI_ENABLED ?? 'false';
  if (openApi !== 'true' && openApi !== 'false') {
    throw new ConfigurationError('CORE_OPENAPI_ENABLED doit être true ou false.');
  }
  let database: PostgreSqlConfig | undefined;
  const secure = env.SESSION_SECURE ?? (environment === 'production' ? 'true' : 'false');
  if (secure !== 'true' && secure !== 'false')
    throw new ConfigurationError('SESSION_SECURE doit être true ou false.');
  if (env.SETUP_TOKEN && !/^[a-f0-9]{64}$/u.test(env.SETUP_TOKEN)) {
    throw new ConfigurationError('SETUP_TOKEN doit contenir 64 caractères hexadécimaux.');
  }
  if (env.INTERNAL_TOKEN && !/^[a-f0-9]{64}$/u.test(env.INTERNAL_TOKEN)) {
    throw new ConfigurationError('INTERNAL_TOKEN doit contenir 64 caractères hexadécimaux.');
  }
  const oidc = loadOidcConfig(env);
  try {
    database = loadDatabaseConfig(env);
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) throw new ConfigurationError(error.message);
    throw error;
  }
  const platform =
    env.SETUP_TOKEN ||
    env.SESSION_SECURE ||
    env.INTERNAL_TOKEN ||
    oidc ||
    environment === 'production'
      ? Object.freeze({
          setupToken: env.SETUP_TOKEN ?? '',
          secureCookies: secure === 'true',
          internalToken: env.INTERNAL_TOKEN ?? '',
          oidc,
        })
      : undefined;
  return Object.freeze({
    environment: environment as CoreConfig['environment'],
    host,
    port: Number(port),
    openApiEnabled: openApi === 'true',
    ...(database ? { database } : {}),
    ...(platform ? { platform } : {}),
  });
}
