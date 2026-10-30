import { DatabaseConfigurationError, loadDatabaseConfig } from '@orkobi/database';
import type { PostgreSqlConfig } from '@orkobi/database';
import type { PlatformConfig } from './platform/config.js';

export interface CoreConfig {
  readonly environment: 'development' | 'test' | 'production';
  readonly host: string;
  readonly port: number;
  readonly openApiEnabled: boolean;
  readonly database?: PostgreSqlConfig;
  readonly platform?: PlatformConfig;
}

export class ConfigurationError extends Error {}

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
  try {
    database = loadDatabaseConfig(env);
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) throw new ConfigurationError(error.message);
    throw error;
  }
  return Object.freeze({
    environment: environment as CoreConfig['environment'],
    host,
    port: Number(port),
    openApiEnabled: openApi === 'true',
    ...(database ? { database } : {}),
    ...(env.SETUP_TOKEN || env.SESSION_SECURE || environment === 'production'
      ? {
          platform: Object.freeze({
            setupToken: env.SETUP_TOKEN ?? '',
            secureCookies: secure === 'true',
          }),
        }
      : {}),
  });
}
