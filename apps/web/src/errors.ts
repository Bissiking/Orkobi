import { PlatformApiError } from './platform/api';

const MAX_MESSAGE_LENGTH = 500;
const MAX_REPORTS = 5;

export type ErrorScope = 'window' | 'unhandledrejection' | 'boundary';

export interface ErrorReport {
  readonly scope: ErrorScope;
  readonly name: string;
  readonly message: string;
  readonly at: string;
}

const reports: ErrorReport[] = [];
const listeners = new Set<(value: ErrorReport[]) => void>();

function snapshot(): ErrorReport[] {
  return [...reports];
}

function push(report: ErrorReport): void {
  reports.unshift(report);
  if (reports.length > MAX_REPORTS) reports.length = MAX_REPORTS;
  for (const listener of listeners) listener(snapshot());
}

/** Rapport structuré : console bornée, aucun envoi réseau, aucun secret ajouté. */
export function reportError(scope: ErrorScope, error: unknown): void {
  const name = error instanceof Error ? error.name : typeof error;
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw.length > MAX_MESSAGE_LENGTH ? `${raw.slice(0, MAX_MESSAGE_LENGTH)}…` : raw;
  console.error('[orkobi]', { scope, name, message });
  push({ scope, name, message, at: new Date().toISOString() });
}

export function subscribeErrorReports(listener: (value: ErrorReport[]) => void): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function clearErrorReports(): void {
  reports.length = 0;
  for (const listener of listeners) listener(snapshot());
}

/** Capture des rejets et exceptions non interceptés ; ne supprime pas le comportement par défaut du navigateur. */
export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (event) => {
    reportError('window', event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportError('unhandledrejection', event.reason);
  });
}

/** Bannière visible en dev ou si l'installateur force le flag `orkobi.debugErrors`. */
export function errorBannerEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return localStorage.getItem('orkobi.debugErrors') === '1';
  } catch {
    return false;
  }
}

/** Code normalisé d'un rejet : `PlatformApiError` ou objet portant un `code` chaîne, sinon `unknown`. */
export function errorCode(failure: unknown): string {
  if (typeof failure === 'string') return failure;
  if (failure instanceof PlatformApiError) return failure.code;
  if (
    failure !== null &&
    typeof failure === 'object' &&
    'code' in failure &&
    typeof (failure as { code: unknown }).code === 'string'
  ) {
    return (failure as { code: string }).code;
  }
  return 'unknown';
}

/** Message localisé pour un code, avec clé de repli si le code est inconnu. */
export function errorMessage<M extends Record<string, string>>(
  code: string,
  messages: M,
  fallback: string,
): string {
  const direct = Object.hasOwn(messages, code) ? messages[code] : undefined;
  return direct ?? messages[fallback] ?? code;
}
