import type { LoggerService } from '@nestjs/common';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';
type LogFields = Readonly<Record<string, string | number>>;
export type LogSink = (line: string) => void;

/** Champs explicites uniquement : aucun corps, URL, en-tête ou objet d'erreur brut. */
export class JsonLogger implements LoggerService {
  constructor(private readonly sink: LogSink = (line) => process.stdout.write(`${line}\n`)) {}

  event(level: LogLevel, event: string, fields: LogFields = {}): void {
    this.sink(JSON.stringify({ ...fields, timestamp: new Date().toISOString(), level, event }));
  }

  // Les messages arbitraires du framework peuvent contenir des données d'exception.
  log(): void {
    this.event('info', 'framework');
  }
  warn(): void {
    this.event('warn', 'framework');
  }
  error(): void {
    this.event('error', 'framework_error');
  }
  debug(): void {
    this.event('debug', 'framework');
  }
  verbose(): void {
    this.event('debug', 'framework');
  }
  fatal(): void {
    this.event('error', 'framework_error');
  }
}
