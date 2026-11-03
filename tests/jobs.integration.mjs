const { performance, fetch } = globalThis;
import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import process from 'node:process';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createApplication } from '../apps/core/dist/application.js';
import { loadConfig } from '../apps/core/dist/config.js';
import { JsonLogger } from '../apps/core/dist/logger.js';
import { JobEngine } from '../apps/core/dist/jobs/service.js';
import { JobRegistry } from '../apps/core/dist/jobs/registry.js';
import { createBffApplication } from '../apps/bff/dist/application.js';
import { loadBffConfig } from '../apps/bff/dist/config.js';
import { JsonLogger as BffLogger } from '../apps/bff/dist/logger.js';
import { loadDatabaseConfig, PostgreSqlDatabase } from '../lib/database/dist/index.js';

assert.match(process.env.DB_NAME ?? '', /^orkobi_verify_[a-z0-9]+$/u);
const require = createRequire(new URL('../lib/database/package.json', import.meta.url));
const { Pool } = require('pg');
const password = 'A long secret passphrase 2026!';
test(
  'Phase 3.3/3.4 : file durable, autorisation, concurrence et reprise',
  { timeout: 120000 },
  async (t) => {
    const sql = new Pool(loadDatabaseConfig(process.env, true)),
      store = new PostgreSqlDatabase(loadDatabaseConfig({ ...process.env, DB_ENABLED: 'true' }));
    const internal = randomBytes(32).toString('hex'),
      logs = [];
    const config = loadConfig({
      ...process.env,
      DB_ENABLED: 'true',
      NODE_ENV: 'test',
      INTERNAL_TOKEN: internal,
      JOBS_ENABLED: 'false',
      SESSION_SECURE: 'false',
    });
    const core = await createApplication(config, new JsonLogger((line) => logs.push(line)));
    await core.listen(0, '127.0.0.1');
    const second = await createApplication(config, new JsonLogger((line) => logs.push(line)));
    await second.listen(0, '127.0.0.1');
    const bff = await createBffApplication(
      {
        ...loadBffConfig({ INTERNAL_TOKEN: internal }),
        coreUrl: await core.getUrl(),
        coreTimeoutMs: 10000,
      },
      new BffLogger((line) => logs.push(line)),
    );
    await bff.listen(0, '127.0.0.1');
    t.after(async () => {
      await bff.close();
      await core.close();
      await second.close();
      await store.close();
      await sql.end();
    });
    const base = await bff.getUrl(),
      engine = core.get(JobEngine),
      otherEngine = second.get(JobEngine),
      registry = core.get(JobRegistry),
      otherRegistry = second.get(JobRegistry);
    const actual = registry.get.bind(registry);
    function client() {
      return {
        cookie: '',
        csrf: '',
        async call(path, body, expected = 200) {
          const response = await fetch(`${base}/api/platform/${path}`, {
            method: body === undefined ? 'GET' : 'POST',
            headers: {
              cookie: this.cookie,
              ...(body === undefined
                ? {}
                : {
                    origin: base,
                    'content-type': 'application/json',
                    'x-orkobi-request': '1',
                    'x-csrf-token': this.csrf,
                  }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          });
          const data = await response.json();
          assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`);
          const cookies = response.headers.getSetCookie();
          if (cookies.length)
            this.cookie = cookies.map((cookie) => cookie.split(';')[0]).join('; ');
          if (data.csrfToken) this.csrf = data.csrfToken;
          return data;
        },
      };
    }
    const admin = client();
    await admin.call('login', { email: 'operator@example.org', password });
    const ownerId = (
      await admin.call('admin/users', {
        email: 'jobs.owner@example.org',
        name: 'Job owner',
        password,
        platformAdmin: false,
      })
    ).id;
    const userId = (
      await admin.call('admin/users', {
        email: 'jobs.other@example.org',
        name: 'Job other',
        password,
        platformAdmin: false,
      })
    ).id;
    const org = await admin.call('admin/organizations', {
      name: 'Jobs A',
      kind: 'business',
      locale: 'fr',
      timezone: 'Europe/Paris',
      ownerId,
    });
    const orgB = await admin.call('admin/organizations', {
      name: 'Jobs B',
      kind: 'business',
      locale: 'fr',
      timezone: 'Europe/Paris',
      ownerId: userId,
    });
    const orgRoles = await admin.call(`admin/organizations/${org.id}/roles`);
    await admin.call(`admin/organizations/${org.id}/members`, {
      email: 'jobs.other@example.org',
      roleId: orgRoles.find((role) => role.builtin === 'admin').id,
      active: true,
    });
    const owner = client(),
      other = client();
    await owner.call('login', { email: 'jobs.owner@example.org', password });
    await other.call('login', { email: 'jobs.other@example.org', password });
    await admin.call('admin/modules/orkobi.demo', { enabled: true });
    await owner.call(`organizations/${org.id}/select`, {});
    await owner.call('modules/orkobi.demo/activate', {});
    await other.call(`organizations/${orgB.id}/select`, {});
    await other.call('modules/orkobi.demo/activate', {});
    const schedule = (body = {}) =>
      owner.call('jobs', { moduleId: 'orkobi.demo', task: 'verify_notes', ...body });
    const job = async (id) =>
      (await sql.query('SELECT * FROM orkobi_core.jobs WHERE id=$1', [id])).rows[0];
    const runs = async (id) =>
      (
        await sql.query('SELECT * FROM orkobi_core.job_runs WHERE job_id=$1 ORDER BY started_at', [
          id,
        ])
      ).rows;
    const due = async (id) =>
      sql.query("UPDATE orkobi_core.jobs SET run_at=now()-interval '1 second' WHERE id=$1", [id]);
    await t.test('route BFF protégée, organisation et manifeste bornés', async () => {
      await owner.call('jobs', { moduleId: 'orkobi.demo', task: 'missing' }, 404);
      await owner.call(
        'jobs',
        { moduleId: 'orkobi.demo', task: 'verify_notes', intervalSeconds: 1 },
        400,
      );
      await owner.call(
        'jobs',
        { moduleId: 'orkobi.demo', task: 'verify_notes', runAt: 'invalid' },
        400,
      );
      const response = await fetch(`${base}/api/platform/jobs`, {
        method: 'POST',
        headers: {
          cookie: owner.cookie,
          origin: base,
          'content-type': 'application/json',
          'x-orkobi-request': '1',
        },
        body: '{}',
      });
      assert.equal(response.status, 403);
      const created = await schedule();
      await other.call(`jobs/${created.id}/cancel`, {}, 404);
      assert.equal((await other.call('jobs')).jobs.length, 0);
      await engine.tick();
      assert.equal((await job(created.id)).status, 'succeeded');
      assert.equal((await runs(created.id))[0].outcome, 'succeeded');
    });
    await t.test('deux workers et deux jobs de même tâche : aucun chevauchement', async () => {
      const first = await schedule(),
        secondJob = await schedule();
      let active = 0,
        maxActive = 0,
        calls = 0,
        unblock;
      const gate = new Promise((resolve) => {
        unblock = resolve;
      });
      const handler = async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        calls++;
        await gate;
        active--;
      };
      registry.get = () => handler;
      otherRegistry.get = () => handler;
      const running = engine.tick();
      while (!active) await delay(5);
      await otherEngine.tick();
      assert.equal(calls, 1);
      unblock();
      await running;
      await otherEngine.tick();
      assert.equal(maxActive, 1);
      assert.equal(calls, 2);
      assert.equal((await job(first.id)).status, 'succeeded');
      assert.equal((await job(secondJob.id)).status, 'succeeded');
      registry.get = actual;
      otherRegistry.get = actual;
    });
    await t.test(
      'désactivation pendant un run : arrêt coopératif, relance bloquée jusqu’à sa fin',
      async () => {
        const { id } = await schedule();
        let release,
          aborted = false;
        registry.get =
          () =>
          async ({ signal }) =>
            new Promise((resolve) => {
              release = resolve;
              signal.addEventListener(
                'abort',
                () => {
                  aborted = true;
                },
                { once: true },
              );
            });
        const running = engine.tick();
        try {
          for (let i = 0; !release && i < 200; i++) await delay(5);
          assert.ok(release);
          await owner.call('modules/orkobi.demo/deactivate', {});
          assert.equal((await job(id)).status, 'suspended');
          await owner.call('modules/orkobi.demo/activate', {});
          await owner.call(`jobs/${id}/retry`, {}, 409);
          for (let i = 0; !aborted && i < 300; i++) await delay(5);
          assert.equal(aborted, true);
        } finally {
          release?.();
          await running;
          registry.get = actual;
        }
        await owner.call(`jobs/${id}/retry`, {});
        await engine.tick();
        assert.equal((await job(id)).status, 'succeeded');
      },
    );
    await t.test('annulation pendant un run : signal transmis et résultat conservé', async () => {
      const { id } = await schedule();
      let release,
        started = false;
      registry.get =
        () =>
        async ({ signal }) =>
          new Promise((resolve) => {
            started = true;
            release = resolve;
            signal.addEventListener('abort', resolve, { once: true });
          });
      const running = engine.tick();
      try {
        for (let i = 0; !started && i < 200; i++) await delay(5);
        assert.ok(started);
        await owner.call(`jobs/${id}/cancel`, {});
        await running;
        assert.equal((await job(id)).status, 'cancelled');
        assert.equal((await runs(id))[0].outcome, 'cancelled');
      } finally {
        release?.();
        await running;
        registry.get = actual;
      }
    });
    await t.test('retries bornés et secrets des exceptions absents de l’historique', async () => {
      const { id } = await schedule();
      registry.get = () => async () => {
        throw new Error('secret-job-sentinel');
      };
      for (let i = 1; i <= 3; i++) {
        await due(id);
        await engine.tick();
        assert.equal((await job(id)).attempts, i);
      }
      assert.equal((await job(id)).status, 'failed');
      assert.equal((await runs(id)).length, 3);
      await owner.call(`jobs/${id}/retry`, {});
      registry.get = actual;
      await engine.tick();
      assert.equal((await job(id)).status, 'succeeded');
      assert.ok(!JSON.stringify(await runs(id)).includes('secret-job-sentinel'));
      assert.ok(!logs.join('').includes('secret-job-sentinel'));
    });
    await t.test('timeout coopératif : verrou conservé jusqu’à la fin du handler', async () => {
      const { id } = await schedule();
      let aborted = false;
      // Le manifeste du registre est lu à chaque exécution ; réduit seulement le timeout de test.
      await sql.query(
        "UPDATE orkobi_core.modules SET manifest=jsonb_set(manifest,'{tasks,0,timeoutMs}','100') WHERE id='orkobi.demo'",
      );
      registry.get =
        () =>
        async ({ signal }) => {
          await new Promise((resolve) =>
            signal.addEventListener(
              'abort',
              () => {
                aborted = true;
                resolve();
              },
              { once: true },
            ),
          );
          await delay(100);
        };
      const started = performance.now();
      await engine.tick();
      assert.ok(aborted);
      assert.ok(performance.now() - started >= 190);
      assert.equal((await job(id)).last_error, 'timeout');
      assert.equal((await runs(id))[0].outcome, 'timeout');
      registry.get = actual;
      await owner.call(`jobs/${id}/cancel`, {});
    });
    await t.test('date future, récurrence sans rattrapage en rafale et annulation', async () => {
      const { id } = await schedule({
        runAt: new Date(Date.now() + 3600000).toISOString(),
        intervalSeconds: 60,
      });
      await engine.tick();
      assert.equal((await runs(id)).length, 0);
      await due(id);
      await engine.tick();
      const recurring = await job(id);
      assert.equal(recurring.status, 'pending');
      assert.equal(recurring.attempts, 0);
      assert.ok(new Date(recurring.run_at) > new Date());
      await owner.call(`jobs/${id}/cancel`, {});
      await due(id);
      await engine.tick();
      assert.equal((await runs(id)).length, 1);
    });
    await t.test(
      'désactivation : suspension atomique et reprise explicite après réactivation',
      async () => {
        const { id } = await schedule();
        await owner.call('modules/orkobi.demo/deactivate', {});
        assert.equal((await job(id)).status, 'suspended');
        await engine.tick();
        assert.equal((await runs(id)).length, 0);
        await owner.call('modules/orkobi.demo/activate', {});
        assert.equal((await job(id)).status, 'suspended');
        await owner.call(`jobs/${id}/retry`, {});
        await engine.tick();
        assert.equal((await job(id)).status, 'succeeded');
      },
    );
    await t.test(
      'révocation de compte entre planification et lancement : aucun handler',
      async () => {
        const { id } = await schedule();
        await admin.call(`admin/users/${ownerId}`, {
          name: 'Job owner',
          active: false,
          platformAdmin: false,
        });
        let called = false;
        registry.get = () => async () => {
          called = true;
        };
        await engine.tick();
        assert.equal(called, false);
        assert.equal((await job(id)).status, 'suspended');
        registry.get = actual;
        await admin.call(`admin/users/${ownerId}`, {
          name: 'Job owner',
          active: true,
          platformAdmin: false,
        });
        await owner.call('login', { email: 'jobs.owner@example.org', password });
        await owner.call(`organizations/${org.id}/select`, {});
        await owner.call(`jobs/${id}/retry`, {});
        await engine.tick();
        assert.equal((await job(id)).status, 'succeeded');
      },
    );
    await t.test(
      'connexion worker perdue : reprise persistée, même clé d’idempotence',
      async () => {
        const { id } = await schedule();
        const lease = await store.jobs.claim();
        try {
          assert.equal(lease.job.id, id);
        } catch (error) {
          await lease?.release();
          throw error;
        }
        const cycle = lease.job.cycleId;
        // La libération simule ici l’arrêt du processus après claim, avant finish.
        await lease.release();
        let key;
        otherRegistry.get = () => async (context) => {
          key = context.idempotencyKey;
        };
        await otherEngine.tick();

        const history = await runs(id);
        assert.deepEqual(
          history.map((row) => row.outcome),
          ['interrupted', 'succeeded'],
        );
        assert.equal((await job(id)).cycle_id, cycle);
        registry.get = actual;
        assert.equal(key, cycle);
        otherRegistry.get = actual;
      },
    );
    await t.test('audit et métriques administrateur sans fuite inter-organisations', async () => {
      const runtime = await admin.call('admin/runtime');
      assert.equal(runtime.cache.mode, 'memory');
      assert.ok(runtime.jobs.completed > 0);
      await owner.call('admin/runtime', undefined, 403);
      const audit = (await owner.call(`organizations/${org.id}/audit`)).map((row) => row.event);
      assert.ok(audit.includes('job.started'));
      assert.ok(audit.includes('job.scheduled'));
      assert.equal((await other.call('jobs')).jobs.length, 0);
    });
  },
);
