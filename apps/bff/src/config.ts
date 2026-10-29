import { readFileSync } from 'node:fs';

export interface BffConfig {
  readonly host: string;
  readonly port: number;
  readonly coreUrl: string;
  readonly coreTimeoutMs: number;
}
export class BffConfigurationError extends Error {}

export const productVersion: string = (
  JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

export function loadBffConfig(env: NodeJS.ProcessEnv = process.env): BffConfig {
  const host = env.BFF_HOST ?? '127.0.0.1';
  if (!host || host.trim() !== host || /[\s/]/u.test(host)) {
    throw new BffConfigurationError('BFF_HOST doit être un nom d’hôte ou une adresse IP.');
  }
  const port = integer(env.BFF_PORT ?? '3000', 'BFF_PORT', 1, 65535);
  const coreTimeoutMs = integer(env.CORE_TIMEOUT_MS ?? '2000', 'CORE_TIMEOUT_MS', 100, 10000);
  let upstream: URL;
  try {
    upstream = new URL(env.CORE_URL ?? 'http://127.0.0.1:3001');
  } catch {
    throw new BffConfigurationError('CORE_URL doit être une origine HTTP ou HTTPS.');
  }
  if (
    !['http:', 'https:'].includes(upstream.protocol) ||
    upstream.username ||
    upstream.password ||
    upstream.pathname !== '/' ||
    upstream.search ||
    upstream.hash
  ) {
    throw new BffConfigurationError(
      'CORE_URL doit être une origine HTTP ou HTTPS sans identifiants ni chemin.',
    );
  }
  return Object.freeze({ host, port, coreUrl: upstream.origin, coreTimeoutMs });
}

function integer(value: string, name: string, min: number, max: number): number {
  if (!/^\d+$/u.test(value) || Number(value) < min || Number(value) > max) {
    throw new BffConfigurationError(`${name} doit être un entier entre ${min} et ${max}.`);
  }
  return Number(value);
}
