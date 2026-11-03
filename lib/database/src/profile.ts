import type { SqlEngine } from './connection.js';
/** Propriétés exposées sans hôte, utilisateur, secret ou chaîne de connexion. */
export function databaseProfile(engine: SqlEngine | null) {
  return {
    engine,
    transactionalDdl: engine === 'postgresql',
    nativeArrays: engine === 'postgresql',
    nativeJson: engine === 'postgresql' || engine === 'mysql',
    namespace: engine === 'postgresql' ? 'schemas' : 'table-prefixes',
    supportedVersion: engine === 'mariadb' ? '11.4 LTS' : engine === 'mysql' ? '8.4 LTS' : '18',
    applicationIsolation: true,
  };
}
