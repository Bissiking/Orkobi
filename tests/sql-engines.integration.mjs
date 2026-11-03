import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import process from 'node:process';
import { createDatabase, loadDatabaseConfig } from '../lib/database/dist/index.js';
import { mysqlMigrations, applyMySqlMigrations } from '../lib/database/dist/mysql-migrations.js';
const require = createRequire(new URL('../lib/database/package.json', import.meta.url));
const mysql = require('mysql2/promise');
assert.match(process.env.DB_NAME ?? '', /^orkobi_verify_[a-z0-9]+$/u);
test('SQL natif : concurrence, journal, dérive, DDL partiel et privilèges', async (t) => {
  const config = loadDatabaseConfig(process.env, true),
    runtime = createDatabase(loadDatabaseConfig(process.env)),
    first = createDatabase(config),
    second = createDatabase(config);
  const connection = { ...config };
  delete connection.engine;
  const sql = await mysql.createConnection(connection);
  t.after(async () => {
    await Promise.all([first.close(), second.close(), runtime.close(), sql.end()]);
  });
  assert.equal(await runtime.isReady(), false);
  await t.test('deux migrateurs, neuf lots une seule fois', async () => {
    const results = await Promise.all([first.migrate(), second.migrate()]);
    assert.deepEqual(results.map((r) => r.length).sort(), [0, mysqlMigrations.length]);
    assert.equal(await runtime.isReady(), true);
    assert.deepEqual(await first.migrate(), []);
  });
  await t.test('moteur déclaré différent du serveur refusé', async () => {
    const wrong = createDatabase({
      ...config,
      engine: config.engine === 'mariadb' ? 'mysql' : 'mariadb',
    });
    try {
      assert.equal(await wrong.isReady(), false);
      await assert.rejects(wrong.migrate());
    } finally {
      await wrong.close();
    }
  });
  await t.test(
    'unicité des rôles et permissions SQL ne contournent pas les invariants',
    async () => {
      const id = '00000000-0000-4000-8000-000000000001',
        role = '00000000-0000-4000-8000-000000000002';
      const probe = new Error('rollback fixture');
      await assert.rejects(
        runtime.platform.transaction(async (repo) => {
          await repo.createOrganization({
            id,
            name: 'Disposable',
            kind: 'business',
            active: true,
            locale: 'fr',
            timezone: 'Europe/Paris',
          });
          await repo.saveRole(role, id, 'Reserved', ['organization:read'], 'admin');
          await assert.rejects(
            repo.saveRole('00000000-0000-4000-8000-000000000003', id, 'Reserved', []),
            (error) => error.code === '23505',
          );
          assert.deepEqual((await repo.role(id, role)).permissions, ['organization:read']);
          await assert.rejects(repo.saveRole(role, id, 'Reserved', ['invalid']));
          throw probe;
        }),
        (error) => error === probe,
      );
    },
  );
  await t.test('checksum altéré et moteur incohérent refusés', async () => {
    await sql.query(
      "UPDATE orkobi_infrastructure__schema_migrations SET checksum=REPEAT('0',64) WHERE id=?",
      [mysqlMigrations[0].id],
    );
    assert.equal(await runtime.isReady(), false);
    await assert.rejects(first.migrate());
    const { mysqlChecksum } = await import('../lib/database/dist/mysql-migrations.js');
    await sql.query('UPDATE orkobi_infrastructure__schema_migrations SET checksum=? WHERE id=?', [
      mysqlChecksum(mysqlMigrations[0]),
      mysqlMigrations[0].id,
    ]);
    await sql.query("UPDATE orkobi_core__engine_metadata SET engine='invalid'");
    assert.equal(await runtime.isReady(), false);
    await assert.rejects(first.migrate());
    await sql.query('UPDATE orkobi_core__engine_metadata SET engine=?', [config.engine]);
  });
  await t.test('DDL partiel conservé et reprise automatique refusée', async () => {
    const expected = [
      ...mysqlMigrations,
      {
        id: '0012_failure_probe',
        statements: ['CREATE TABLE phase5_probe(id integer)', 'SELECT * FROM missing_phase5_table'],
      },
    ];
    await assert.rejects(applyMySqlMigrations(sql, config.engine, expected));
    const [rows] = await sql.query(
      "SELECT state FROM orkobi_infrastructure__schema_migrations WHERE id='0012_failure_probe'",
    );
    assert.equal(rows[0].state, 'applying');
    assert.equal(await runtime.isReady(), false);
    await assert.rejects(first.migrate());
    // Réparation explicite du fixture jetable seulement ; jamais exécutée par le migrateur.
    await sql.query('DROP TABLE phase5_probe');
    await sql.query(
      "DELETE FROM orkobi_infrastructure__schema_migrations WHERE id='0012_failure_probe'",
    );
    assert.equal(await runtime.isReady(), true);
  });
  await t.test('compte runtime sans DDL ni écriture du journal', async () => {
    const runtimeConfig = { ...loadDatabaseConfig(process.env) };
    delete runtimeConfig.engine;
    const app = await mysql.createConnection(runtimeConfig);
    try {
      for (const query of [
        'CREATE TABLE forbidden(id integer)',
        "UPDATE orkobi_infrastructure__schema_migrations SET state='changed'",
        'DELETE FROM orkobi_core__audit_events',
      ])
        await assert.rejects(app.query(query));
    } finally {
      await app.end();
    }
  });
});
