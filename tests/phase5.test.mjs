import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadDatabaseConfig, compileMySql } from '../lib/database/dist/index.js';
import { CapabilityRegistry } from '../apps/core/dist/modules/capability-registry.js';
import { ModuleManager } from '../apps/core/dist/modules/manager.js';
import { RuntimeDiagnostics } from '../apps/core/dist/diagnostics.js';
import { demoManifest } from '../modules/demo/dist/index.js';

test('configuration SQL : moteur inconnu et identifiant dangereux refusés sans reflet du secret', () => {
  for (const env of [{ DB_ENGINE: 'invalid' }, { DB_ENGINE: 'mysql', DB_NAME: 'secret`name' }])
    assert.throws(
      () => loadDatabaseConfig({ DB_ENABLED: 'true', DB_PASSWORD: 'sentinel', ...env }),
      (error) => !error.message.includes('sentinel') && !error.message.includes('secret`name'),
    );
  assert.equal(
    loadDatabaseConfig({ DB_ENABLED: 'true', DB_ENGINE: 'mysql', DB_PASSWORD: 'sentinel' }).port,
    3306,
  );
});
test('valeurs liées : contenu ISO préservé, paramètres réordonnés et JSON sérialisé', () => {
  const value = '2026-11-03T10:00:00.000Z';
  const result = compileMySql(
    'INSERT INTO orkobi_demo.notes (id,title,organization_id) VALUES ($3,$1,$2)',
    [value, 'org', 'id'],
  );
  assert.deepEqual(result.values, ['id', value, 'org']);
  assert.ok(!result.sql.includes(value));
  assert.deepEqual(compileMySql('SELECT $1,$1', [{ title: '$2' }]).values, [
    '{"title":"$2"}',
    '{"title":"$2"}',
  ]);
  assert.throws(() => compileMySql('SELECT $2', ['one']));
});
test('capabilities : exigence moteur absente bloque une activation avant toute écriture', async () => {
  for (const engine of ['postgresql', 'mariadb', 'mysql']) {
    const registry = new CapabilityRegistry({ engine, isReady: async () => true });
    assert.equal(
      await registry.availability('core.sql.arrays'),
      engine === 'postgresql' ? 'available' : 'unavailable',
    );
    assert.equal(
      await registry.availability('core.sql.json'),
      engine === 'mariadb' ? 'unavailable' : 'available',
    );
    const manifest = {
      ...demoManifest,
      capabilities: [{ key: 'core.sql.transactionalddl', required: true }],
    };
    const manager = new ModuleManager({}, registry);
    let writes = 0;
    const repo = {
      plugin: async () => undefined,
      registerModule: async () => {},
      module: async () => ({ manifest, enabled: true }),
      organizationModules: async () => [],
      setOrganizationModule: async () => {
        writes++;
      },
      audit: async () => {},
    };
    if (engine === 'postgresql')
      await manager.setOrganizationActive(repo, 'user', 'org', manifest.id, true);
    else
      await assert.rejects(
        manager.setOrganizationActive(repo, 'user', 'org', manifest.id, true),
        (error) => error.getStatus() === 409,
      );
    assert.equal(writes, engine === 'postgresql' ? 1 : 0);
    for (const key of ['core.nosql', 'core.storage.objects', 'core.orchestration.aion'])
      assert.equal(await registry.availability(key), 'unavailable');
  }
});
test('diagnostic : compteurs, histogramme borné et erreurs serveur, sans identité', () => {
  const metrics = new RuntimeDiagnostics();
  try {
    for (const [status, time] of [
      [200, 10],
      [403, 100],
      [503, 500],
      [500, 6000],
    ])
      metrics.record(status, time);
    const result = metrics.snapshot();
    assert.equal(result.http.requests, 4);
    assert.equal(result.http.serverErrors, 2);
    assert.deepEqual(result.http.durationBuckets.counts, [1, 1, 1, 0, 1]);
    assert.ok(result.memory.rssBytes > 0);
    assert.equal(Number.isFinite(result.eventLoop.meanMs), true);
    assert.ok(!JSON.stringify(result).includes('password'));
  } finally {
    metrics.onApplicationShutdown();
  }
});

test('préparation SQL : secrets séparés, aucun écrasement et moteur invalide refusé', async () => {
  const { mkdtemp, mkdir, copyFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const { parseEnv } = await import('node:util');
  const { default: process } = await import('node:process');
  const directory = await mkdtemp(join(tmpdir(), 'orkobi-sql-config-'));
  try {
    await mkdir(join(directory, 'scripts'));
    await mkdir(join(directory, 'infra/mysql'), { recursive: true });
    await copyFile('scripts/setup-env.mjs', join(directory, 'scripts/setup-env.mjs'));
    await copyFile('infra/mysql/.env.example', join(directory, 'infra/mysql/.env.example'));
    const run = (engine) =>
      spawnSync(
        process.execPath,
        [join(directory, 'scripts/setup-env.mjs'), `--engine=${engine}`],
        { encoding: 'utf8' },
      );
    for (const engine of ['mariadb', 'mysql']) {
      assert.equal(run(engine).status, 0);
      const file = join(directory, `.env.${engine}`),
        content = await readFile(file, 'utf8'),
        env = parseEnv(content);
      assert.equal(env.DB_ENGINE, engine);
      assert.equal(env.SQL_IMAGE, engine === 'mysql' ? 'mysql:8.4' : 'mariadb:11.4');
      const secrets = [
        'SQL_ROOT_PASSWORD',
        'DB_PASSWORD',
        'MIGRATION_DB_PASSWORD',
        'SETUP_TOKEN',
        'INTERNAL_TOKEN',
      ].map((key) => env[key]);
      for (const secret of secrets) assert.match(secret, /^[a-f0-9]{64}$/u);
      assert.equal(new Set(secrets).size, 5);
      assert.equal(run(engine).status, 1);
      assert.equal(await readFile(file, 'utf8'), content);
    }
    assert.equal(run('unknown').status, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
