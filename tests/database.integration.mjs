import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import process from 'node:process';
import { URL } from 'node:url';
import { test } from 'node:test';
import { loadDatabaseConfig, PostgreSqlDatabase } from '../lib/database/dist/index.js';
import { applyMigrations, migrations } from '../lib/database/dist/migrations.js';

const require = createRequire(new URL('../lib/database/package.json', import.meta.url));
const { Pool } = require('pg');

// Ce fichier ne doit être exécuté que sur la base dédiée du projet de test isolé.
assert.match(process.env.DB_NAME ?? '', /^orkobi_verify_[a-z0-9]+$/u);
const migrationConfig = loadDatabaseConfig(process.env, true);
const runtimeConfig = loadDatabaseConfig({ ...process.env, DB_ENABLED: 'true' });

test('PostgreSQL réel : migrations, concurrence, rollback, dérive et droits', async (t) => {
  const pool = new Pool({ ...migrationConfig, connectionTimeoutMillis: 2000 });
  const first = new PostgreSqlDatabase(migrationConfig);
  const second = new PostgreSqlDatabase(migrationConfig);
  const runtime = new PostgreSqlDatabase(runtimeConfig);
  t.after(async () => {
    await Promise.all([pool.end(), first.close(), second.close(), runtime.close()]);
  });
  assert.equal(await runtime.isReady(), false);

  await t.test(
    'mise à niveau depuis 0.4 : schéma 0001 conservé, plateforme encore indisponible',
    async () => {
      const client = await pool.connect();
      try {
        assert.deepEqual(await applyMigrations(client, migrations.slice(0, 1)), [
          '0001_core_schema',
        ]);
      } finally {
        client.release();
      }
      assert.equal(await runtime.isReady(), false);
    },
  );

  await t.test(
    'deux migrations concurrentes : une application, puis aucun changement',
    async () => {
      const results = await Promise.all([first.migrate(), second.migrate()]);
      assert.deepEqual(results.map((value) => value.length).sort(), [0, migrations.length - 1]);
      assert.deepEqual(await first.migrate(), []);
      assert.equal(await runtime.isReady(), true);
    },
  );

  await t.test('échec SQL : DDL et registre annulés ensemble', async () => {
    const client = await pool.connect();
    try {
      await assert.rejects(
        applyMigrations(client, [
          ...migrations,
          {
            id: '0003_rollback_probe',
            sql: 'CREATE TABLE orkobi_core.rollback_probe (id integer); SELECT absent_column;',
          },
        ]),
      );
      assert.equal(
        (await client.query("SELECT to_regclass('orkobi_core.rollback_probe') AS probe")).rows[0]
          .probe,
        null,
      );
      assert.equal(
        (
          await client.query(
            'SELECT count(*)::integer AS count FROM orkobi_infrastructure.schema_migrations',
          )
        ).rows[0].count,
        migrations.length,
      );
      assert.equal(await runtime.isReady(), true);
    } finally {
      client.release();
    }
  });

  await t.test(
    'historique modifié ou plus récent : refus de migration et de readiness',
    async () => {
      const client = await pool.connect();
      try {
        await assert.rejects(
          applyMigrations(client, [{ ...migrations[0], sql: 'SELECT 1;' }]),
          /incompatible/u,
        );
        await client.query(
          "UPDATE orkobi_infrastructure.schema_migrations SET checksum = 'invalid' WHERE id = '0001_core_schema'",
        );
        assert.equal(await runtime.isReady(), false);
        await assert.rejects(first.migrate(), /incompatible/u);
        // Restaure uniquement l'empreinte de cette base de test, jamais une base opérateur.
        const { checksum } = await import('../lib/database/dist/migrations.js');
        await client.query(
          "UPDATE orkobi_infrastructure.schema_migrations SET checksum = $1 WHERE id = '0001_core_schema'",
          [checksum(migrations[0])],
        );
        await client.query(
          "INSERT INTO orkobi_infrastructure.schema_migrations (id, checksum) VALUES ('9999_future', 'future')",
        );
        assert.equal(await runtime.isReady(), false);
        await assert.rejects(first.migrate(), /incompatible/u);
        await client.query(
          "DELETE FROM orkobi_infrastructure.schema_migrations WHERE id = '9999_future'",
        );
      } finally {
        client.release();
      }
    },
  );

  await t.test('compte Core : lecture du registre, aucun DDL ni écriture', async () => {
    const appPool = new Pool(runtimeConfig);
    try {
      assert.equal(
        (
          await appPool.query(
            'SELECT count(*)::integer AS count FROM orkobi_infrastructure.schema_migrations',
          )
        ).rows[0].count,
        migrations.length,
      );
      for (const sql of [
        'CREATE SCHEMA forbidden',
        'CREATE TABLE public.forbidden (id integer)',
        'CREATE TABLE orkobi_core.forbidden (id integer)',
        'DELETE FROM orkobi_infrastructure.schema_migrations',
      ])
        await assert.rejects(appPool.query(sql), (error) => error.code === '42501');
      const roles = await appPool.query(
        'SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user',
      );
      assert.deepEqual(roles.rows[0], {
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
      });
    } finally {
      await appPool.end();
    }
    assert.equal(await runtime.isReady(), true);
  });
});
