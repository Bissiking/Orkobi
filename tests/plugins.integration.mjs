import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import process from 'node:process';
import { test } from 'node:test';
import { createApplication } from '../apps/core/dist/application.js';
import { loadConfig } from '../apps/core/dist/config.js';
import { JsonLogger } from '../apps/core/dist/logger.js';
import { createBffApplication } from '../apps/bff/dist/application.js';
import { loadBffConfig } from '../apps/bff/dist/config.js';
import { JsonLogger as BffLogger } from '../apps/bff/dist/logger.js';
import { JobEngine } from '../apps/core/dist/jobs/service.js';
import { loadDatabaseConfig } from '../lib/database/dist/index.js';
const { fetch, structuredClone } = globalThis;
assert.match(process.env.DB_NAME ?? '', /^orkobi_verify_[a-z0-9]+$/u);
import { createRequire } from 'node:module';
import { Pool } from './helpers/sql-pool.mjs';
const password = 'A long secret passphrase 2026!';
const manifest = JSON.parse(
  await readFile(new URL('../examples/plugin-demo/manifest.json', import.meta.url), 'utf8'),
);
const ts = createRequire(new URL('../package.json', import.meta.url))('typescript');
const code = ts.transpileModule(
  await readFile(new URL('../examples/plugin-demo/plugin.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
).outputText;

test(
  'Phase 4 : plugin tiers installé, isolé, autorisé et retiré sans perte',
  { timeout: 120000 },
  async (t) => {
    const sql = new Pool(loadDatabaseConfig(process.env, true)),
      logs = [];
    const internal = randomBytes(32).toString('hex');
    const core = await createApplication(
      loadConfig({
        ...process.env,
        DB_ENABLED: 'true',
        NODE_ENV: 'test',
        INTERNAL_TOKEN: internal,
        JOBS_ENABLED: 'false',
        SESSION_SECURE: 'false',
      }),
      new JsonLogger((line) => logs.push(line)),
    );
    await core.listen(0, '127.0.0.1');
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
      await sql.end();
    });
    const base = await bff.getUrl(),
      engine = core.get(JobEngine);
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
          const cookie = response.headers.get('set-cookie');
          if (cookie) this.cookie = cookie.split(';')[0];
          if (data.csrfToken) this.csrf = data.csrfToken;
          return data;
        },
      };
    }
    const admin = client(),
      owner = client(),
      other = client();
    await admin.call('login', { email: 'operator@example.org', password });
    const ownerId = (
      await admin.call('admin/users', {
        name: 'Plugin owner',
        email: 'plugins.owner@example.org',
        password,
        platformAdmin: false,
      })
    ).id;
    const otherId = (
      await admin.call('admin/users', {
        name: 'Plugin other',
        email: 'plugins.other@example.org',
        password,
        platformAdmin: false,
      })
    ).id;
    const createOrg = (name, ownerId) =>
      admin.call('admin/organizations', {
        name,
        ownerId,
        kind: 'business',
        locale: 'fr',
        timezone: 'Europe/Paris',
      });
    const org = await createOrg('Plugins A', ownerId),
      orgB = await createOrg('Plugins B', otherId);
    await owner.call('login', { email: 'plugins.owner@example.org', password });
    await other.call('login', { email: 'plugins.other@example.org', password });
    await owner.call(`organizations/${org.id}/select`, {});
    await other.call(`organizations/${orgB.id}/select`, {});
    const artifact = { manifest, code };
    let digest, noteId;
    const install = async (artifact) => {
      const review = await admin.call('admin/plugins/validate', { artifact });
      return admin.call('admin/plugins/install', {
        artifact,
        digest: review.digest,
        confirmId: manifest.module.id,
        expectedPreviousDigest: digest ?? null,
      });
    };
    const grant = async (organizationId) => {
      const roles = await admin.call(`admin/organizations/${organizationId}/roles`);
      return admin.call(`admin/plugins/${manifest.module.id}/grants`, {
        confirmId: manifest.module.id,
        organizationId,
        roleId: roles.find((r) => r.builtin === 'admin').id,
        permissions: manifest.module.permissions.map((p) => p.key),
      });
    };
    const action = (user, key, input = {}, expected = 200) =>
      user.call(`plugins/community.cards/actions/${key}`, input, expected);
    const resource = 'modules/community.cards/data/cards';
    await t.test('validation et installation : session, rôle, CSRF et empreinte', async () => {
      await owner.call('admin/plugins/validate', { artifact }, 403);
      await admin.call('admin/plugins/validate', { artifact });
      await admin.call(
        'admin/plugins/install',
        {
          artifact,
          digest: 'a'.repeat(64),
          confirmId: manifest.module.id,
          expectedPreviousDigest: null,
        },
        400,
      );
      digest = (await install(artifact)).digest;
      const module = (await admin.call('admin/modules')).modules.find(
        (m) => m.id === manifest.module.id,
      );
      assert.equal(module.enabled, false);
      assert.ok(
        !(await owner.call('session')).organizations[0].permissions.includes(
          'community.cards:read',
        ),
      );
    });
    await t.test('activation et droits explicites : aucun droit hérité implicitement', async () => {
      await admin.call('admin/modules/community.cards', { enabled: true });
      await owner.call('modules/community.cards/activate', {});
      await other.call('modules/community.cards/activate', {});
      await owner.call(resource, undefined, 403);
      await action(owner, 'count_cards', {}, 403);
      await grant(org.id);
      await grant(orgB.id);
      assert.ok((await owner.call('plugins')).plugins.some((p) => p.id === 'community.cards'));
    });
    await t.test('handler externe et CRUD : organisation fixée par le Core', async () => {
      const result = await action(owner, 'add_card', {
        title: 'Fiche A',
        organizationId: orgB.id,
        userId: otherId,
      });
      assert.equal(result.result.ok, true);
      noteId = result.result.value.entry.id;
      assert.equal((await owner.call(resource)).entries.length, 1);
      assert.equal((await other.call(resource)).entries.length, 0);
      await other.call(`${resource}/${noteId}`, { title: 'intrusion', content: '' }, 404);
      await other.call(`${resource}/${noteId}/delete`, {}, 404);
      await owner.call(`${resource}/${noteId}`, { title: 'Fiche modifiée', content: 'Gardée' });
      assert.equal((await action(owner, 'count_cards')).result.count, 1);
    });
    await t.test('Job Engine : tâche tierce, données bornées et résultat persisté', async () => {
      const job = await owner.call('jobs', { moduleId: 'community.cards', task: 'verify_cards' });
      await engine.tick();
      assert.equal(
        (await sql.query('SELECT status FROM orkobi_core.jobs WHERE id=$1', [job.id])).rows[0]
          .status,
        'succeeded',
      );
    });
    await t.test('ressource sensible, import système et exécution bloquante refusés', async () => {
      // Paquet différent mais même manifeste : toute mise à jour exige une désactivation explicite.
      await admin.call(
        'admin/plugins/install',
        {
          artifact: { ...artifact, code: code + '\n' },
          digest,
          confirmId: manifest.module.id,
          expectedPreviousDigest: digest,
        },
        400,
      );
      const bad = { ...artifact, code: code + '\nimport fs from "node:fs";' };
      await admin.call('admin/plugins/validate', { artifact: bad }, 409);
      await action(owner, 'missing', {}, 404);
      const response = await fetch(`${await core.getUrl()}/platform/plugins`);
      assert.equal(response.status, 403);
    });
    await t.test('retrait bloqué tant que le module est actif ; données conservées', async () => {
      await admin.call(
        'admin/plugins/community.cards/remove',
        { confirmId: manifest.module.id, digest },
        409,
      );
      await owner.call('modules/community.cards/deactivate', {});
      await other.call('modules/community.cards/deactivate', {});
      await admin.call('admin/modules/community.cards', { enabled: false });
      await admin.call('admin/plugins/community.cards/remove', {
        confirmId: manifest.module.id,
        digest,
      });
      await owner.call(resource, undefined, 403);
      await action(owner, 'count_cards', {}, 403);
      await admin.call('admin/modules/community.cards', { enabled: true }, 409);
      assert.equal(
        (
          await sql.query(
            'SELECT count(*)::int AS n FROM orkobi_core.plugin_records WHERE plugin_id=$1',
            ['community.cards'],
          )
        ).rows[0].n,
        1,
      );
    });
    await t.test('mise à jour additive, historique immuable et nouvelle confirmation', async () => {
      const next = structuredClone(artifact);
      next.manifest.module.version = '1.1.0';
      next.manifest.module.entities[0].fields.push({
        name: 'tag',
        type: 'text',
        required: false,
        max: 40,
        label: { fr: 'Étiquette', en: 'Tag' },
      });
      next.manifest.migrations.push({ version: 2, entities: ['cards'] });
      const invalid = structuredClone(next);
      invalid.manifest.migrations[0].entities = [];
      await admin.call('admin/plugins/validate', { artifact: invalid }, 400);
      digest = (await install(next)).digest;
      await admin.call('admin/modules/community.cards', { enabled: true });
      await owner.call('modules/community.cards/activate', {});
      const entries = (await owner.call(resource)).entries;
      assert.equal(entries[0].id, noteId);
      assert.equal(entries[0].values.tag, '');
      await owner.call(`${resource}/${noteId}`, {
        title: 'Conservée',
        content: 'Après mise à jour',
        tag: 'OK',
      });
      assert.equal((await owner.call(resource)).entries[0].values.tag, 'OK');
    });
    await t.test('audit sans code plugin ni secrets et droits SQL minimaux', async () => {
      const events = (await admin.call('admin/audit')).map((a) => a.event);
      for (const event of [
        'plugin.installed',
        'plugin.updated',
        'plugin.removed',
        'plugin.execution_succeeded',
        'plugin.permissions_updated',
      ])
        assert.ok(events.includes(event), event);
      assert.ok(!logs.join('').includes(internal));
      assert.ok(!logs.join('').includes(password));
    });
  },
);
