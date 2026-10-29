import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  loadDatabaseConfig,
  DatabaseConfigurationError,
  PostgreSqlDatabase,
} from '../lib/database/dist/index.js';
import { loadConfig } from '../apps/core/dist/config.js';
import { createApplication } from '../apps/core/dist/application.js';
import { JsonLogger } from '../apps/core/dist/logger.js';

const { fetch } = globalThis;

test('SQL : configuration désactivée par défaut, identifiants de migration distincts', () => {
  assert.equal(loadDatabaseConfig({}), undefined);
  const config = loadDatabaseConfig({
    DB_ENABLED: 'true',
    DB_PASSWORD: 'runtime',
    MIGRATION_DB_PASSWORD: 'migration',
  });
  assert.equal(config.user, 'orkobi_app');
  assert.equal(config.password, 'runtime');
  assert.ok(Object.isFrozen(config));
  assert.equal(
    loadDatabaseConfig({ MIGRATION_DB_PASSWORD: 'migration' }, true).user,
    'orkobi_migrator',
  );
  assert.equal(
    loadConfig({ DB_ENABLED: 'true', DB_PASSWORD: 'runtime' }).database.user,
    'orkobi_app',
  );
  for (const env of [
    { DB_ENABLED: 'yes-secret' },
    { DB_ENABLED: 'true' },
    { DB_ENABLED: 'true', DB_PASSWORD: 'secret', DB_PORT: '0' },
    { DB_ENABLED: 'true', DB_PASSWORD: 'secret', DB_HOST: 'secret/path' },
    { DB_ENABLED: 'true', DB_PASSWORD: 'secret', DB_USER: ' secret' },
  ]) {
    assert.throws(
      () => loadDatabaseConfig(env),
      (error) => {
        assert.ok(error instanceof DatabaseConfigurationError);
        assert.ok(!error.message.includes('secret'));
        return true;
      },
    );
  }
});

test('SQL : panne de connexion bornée, sans exception brute', { timeout: 6000 }, async () => {
  const database = new PostgreSqlDatabase({
    host: '127.0.0.1',
    port: 1,
    database: 'absent',
    user: 'absent',
    password: 'secret',
  });
  try {
    assert.equal(await database.isReady(), false);
  } finally {
    await database.close();
  }
});

test('Core : vitalité indépendante de SQL, readiness 503 si désactivé ou inaccessible', async (t) => {
  for (const database of [
    undefined,
    { host: '127.0.0.1', port: 1, database: 'absent', user: 'absent', password: 'secret' },
  ]) {
    const logs = [];
    const app = await createApplication(
      { ...loadConfig({}), ...(database ? { database } : {}) },
      new JsonLogger((line) => logs.push(line)),
    );
    t.after(() => app.close());
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    assert.equal((await fetch(`${url}/health`)).status, 200);
    const response = await fetch(`${url}/health/ready`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'unavailable');
    assert.ok(!logs.join('').includes('secret'));
  }
});
