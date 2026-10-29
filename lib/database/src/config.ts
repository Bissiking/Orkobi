export interface PostgreSqlConfig {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly password: string;
}

export class DatabaseConfigurationError extends Error {}

/** Configuration serveur uniquement ; aucune valeur rejetée n'est incluse dans l'erreur. */
export function loadDatabaseConfig(
  env: Record<string, string | undefined>,
  migration = false,
): PostgreSqlConfig | undefined {
  const enabled = env.DB_ENABLED ?? 'false';
  if (enabled !== 'true' && enabled !== 'false') {
    throw new DatabaseConfigurationError('DB_ENABLED doit être true ou false.');
  }
  if (enabled === 'false' && !migration) return undefined;
  const host = env.DB_HOST ?? '127.0.0.1';
  const port = env.DB_PORT ?? '5432';
  const database = env.DB_NAME ?? 'orkobi';
  const userKey = migration ? 'MIGRATION_DB_USER' : 'DB_USER';
  const passwordKey = migration ? 'MIGRATION_DB_PASSWORD' : 'DB_PASSWORD';
  const user = env[userKey] ?? (migration ? 'orkobi_migrator' : 'orkobi_app');
  const password = env[passwordKey];
  if (!host || /[\s/]/u.test(host)) {
    throw new DatabaseConfigurationError('DB_HOST doit être un hôte sans chemin.');
  }
  if (!/^\d+$/u.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new DatabaseConfigurationError('DB_PORT doit être un entier entre 1 et 65535.');
  }
  for (const [key, value] of [
    ['DB_NAME', database],
    [userKey, user],
  ] as const) {
    if (!value || value.trim() !== value || value.includes('\0')) {
      throw new DatabaseConfigurationError(
        `${key} doit être non vide et sans espaces périphériques.`,
      );
    }
  }
  if (!password || password.includes('\0')) {
    throw new DatabaseConfigurationError(`${passwordKey} doit être renseigné.`);
  }
  return Object.freeze({ host, port: Number(port), database, user, password });
}
