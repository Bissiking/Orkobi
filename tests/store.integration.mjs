import { CoreDatabase } from '../apps/core/dist/database.service.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import process from 'node:process';
import { createServer } from 'node:http';
import { URL } from 'node:url';
import { createApplication } from '../apps/core/dist/application.js';
import { loadConfig } from '../apps/core/dist/config.js';
import { JsonLogger } from '../apps/core/dist/logger.js';
import { createBffApplication } from '../apps/bff/dist/application.js';
import { loadBffConfig } from '../apps/bff/dist/config.js';
import { JsonLogger as BffLogger } from '../apps/bff/dist/logger.js';
import { storeFixture } from './helpers/store-fixture.mjs';
import { artifactDigest, signCatalog } from '../lib/store/dist/index.js';
const { fetch, structuredClone } = globalThis;
assert.match(process.env.DB_NAME ?? '', /^orkobi_verify_[a-z0-9]+$/u);
const password = 'A long secret passphrase 2026!';

test(
  'Phase 6 : Store indépendant, chaîne signée, mises à jour et autonomie hors ligne',
  { timeout: 120000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'orkobi-store-integration-')),
      logs = [];
    let child, officialChild, core, bff;
    const internal = randomBytes(32).toString('hex'),
      token = randomBytes(32).toString('hex');
    await mkdir(`${directory}/private`, { recursive: true });
    await mkdir(`${directory}/official`);
    const fixture = await storeFixture(`${directory}/private`),
      official = await storeFixture(`${directory}/official`, 'official');
    await official.publish([]);
    async function start(directory, fixture, secret) {
      const child = fork(new URL('./helpers/store-process.mjs', import.meta.url), {
        env: {
          STORE_TEST_CONFIG: JSON.stringify({
            directory,
            repositoryId: fixture.repositoryId,
            publicKeys: [fixture.keys.publicKey],
            ...(secret ? { token: secret } : {}),
          }),
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
      child.stderr.on('data', (line) => logs.push(String(line)));
      const [message] = await once(child, 'message');
      return { child, url: `http://127.0.0.1:${message.port}/` };
    }
    const started = await start(`${directory}/private`, fixture, token);
    child = started.child;
    const publicStarted = await start(`${directory}/official`, official);
    officialChild = publicStarted.child;
    // Réponse hostile synthétique : clé étrangère malgré une syntaxe correcte.
    const hostile = createServer(async (_request, response) => {
      const data = JSON.parse(await readFile(`${directory}/private/catalog.json`, 'utf8'));
      data.catalog.repositoryId = 'hostile';
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(signCatalog(data.catalog, fixture.keys.privateKey)));
    });
    hostile.listen(0, '127.0.0.1');
    await once(hostile, 'listening');
    const repos = [
      {
        id: 'demo',
        name: 'Private demo',
        channel: 'private',
        url: started.url,
        publicKeys: [fixture.keys.publicKey],
        token,
        allowHttp: true,
      },
      {
        id: 'official',
        name: 'Official demo',
        channel: 'official',
        url: publicStarted.url,
        publicKeys: [official.keys.publicKey],
        allowHttp: true,
      },
      {
        id: 'hostile',
        name: 'Untrusted demo',
        channel: 'community',
        url: `http://127.0.0.1:${hostile.address().port}/`,
        publicKeys: [official.keys.publicKey],
        allowHttp: true,
      },
    ];
    const config = loadConfig({
      ...process.env,
      DB_ENABLED: 'true',
      NODE_ENV: 'test',
      INTERNAL_TOKEN: internal,
      JOBS_ENABLED: 'false',
      SESSION_SECURE: 'false',
      STORE_REPOSITORIES_JSON: JSON.stringify(repos),
    });
    let base;
    async function boot() {
      core = await createApplication(config, new JsonLogger((line) => logs.push(line)));
      await core.listen(0, '127.0.0.1');
      bff = await createBffApplication(
        {
          ...loadBffConfig({ INTERNAL_TOKEN: internal }),
          coreUrl: await core.getUrl(),
          coreTimeoutMs: 15000,
        },
        new BffLogger((line) => logs.push(line)),
      );
      await bff.listen(0, '127.0.0.1');
      base = await bff.getUrl();
    }
    async function stopChild(value) {
      if (value?.exitCode === null) {
        value.kill('SIGTERM');
        await once(value, 'exit');
      }
    }
    t.after(async () => {
      await bff?.close();
      await core?.close();
      await stopChild(child);
      await stopChild(officialChild);
      await new Promise((resolve) => {
        hostile.close(resolve);
        hostile.closeAllConnections();
      });
      await rm(directory, { recursive: true, force: true });
    });
    await boot();
    function client() {
      return {
        cookie: '',
        csrf: '',
        async call(path, body, status = 200) {
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
          assert.equal(response.status, status, `${path}: ${JSON.stringify(data)}`);
          if (response.headers.getSetCookie().length)
            this.cookie = response.headers
              .getSetCookie()
              .map((cookie) => cookie.split(';')[0])
              .join('; ');
          if (data.csrfToken) this.csrf = data.csrfToken;
          return data;
        },
      };
    }
    const admin = client(),
      owner = client();
    await admin.call('login', { email: 'operator@example.org', password });
    const id = fixture.artifact.manifest.module.id,
      read = `${id}:read`,
      write = `${id}:write`;
    const ownerId = (
      await admin.call('admin/users', {
        email: 'store.owner@example.org',
        name: 'Store owner',
        password,
        platformAdmin: false,
      })
    ).id;
    const org = await admin.call('admin/organizations', {
      name: 'Store verification',
      kind: 'business',
      locale: 'fr',
      timezone: 'Europe/Paris',
      ownerId,
    });
    const roles = await admin.call(`admin/organizations/${org.id}/roles`),
      role = roles.find((role) => role.builtin === 'admin');
    await owner.call('login', { email: 'store.owner@example.org', password });
    await owner.call(`organizations/${org.id}/select`, {});
    const review = (artifact) =>
      admin.call('admin/store/review', {
        repositoryId: 'demo',
        id,
        version: artifact.manifest.module.version,
        digest: artifactDigest(artifact),
      });
    const install = (review, extra = {}) =>
      admin.call('admin/store/install', {
        reviewId: review.reviewId,
        confirmId: id,
        digest: review.release.digest,
        expectedPreviousDigest: review.previousDigest,
        acknowledgeSource: true,
        acknowledgeNewPermissions: true,
        ...extra,
      });
    let firstReview;
    await t.test('API publique/privée, authentification, clés et secrets', async () => {
      await client().call('admin/store', undefined, 401);
      await owner.call('admin/store', undefined, 403);
      assert.equal((await fetch(`${started.url}v1/catalog`)).status, 401);
      assert.equal((await fetch(`${publicStarted.url}v1/catalog`)).status, 200);
      const result = await admin.call('admin/store');
      assert.equal(result.repositories[0].state, 'ready');
      assert.equal(result.repositories[0].channel, 'private');
      assert.equal(result.repositories[1].state, 'ready');
      assert.equal(result.repositories[2].state, 'untrusted');
      assert.ok(!JSON.stringify(result).includes(token));
      assert.ok(!JSON.stringify(result).includes('PRIVATE KEY'));
    });
    await t.test(
      'revue signée et confirmation explicite, aucun nouveau droit implicite',
      async () => {
        firstReview = await review(fixture.artifact);
        assert.equal(firstReview.newPermissions.length, 2);
        await admin.call('admin/store/install', { reviewId: firstReview.reviewId }, 400);
        await owner.call('admin/store/install', { reviewId: firstReview.reviewId }, 403);
        await install(firstReview);
        await admin.call('admin/store/install', { reviewId: firstReview.reviewId }, 409);
        await admin.call(`admin/modules/${id}`, { enabled: true });
        await owner.call(`modules/${id}/activate`, {});
        await owner.call(`plugins/${id}/actions/add_card`, { title: 'Denied' }, 403);
        await admin.call(`admin/plugins/${id}/grants`, {
          confirmId: id,
          organizationId: org.id,
          roleId: role.id,
          permissions: [read, write],
        });
        const result = await owner.call(`plugins/${id}/actions/add_card`, {
          title: 'Persisted',
          content: 'Store',
        });
        assert.equal(result.result.ok, true);
      },
    );
    const update = structuredClone(fixture.artifact);
    update.manifest.module.version = '1.1.0';
    update.manifest.module.permissions.push({ key: `${id}:export`, description: 'Export cards' });
    update.manifest.module.entities[0].fields.push({
      name: 'tag',
      type: 'text',
      required: false,
      max: 120,
      label: { fr: 'Étiquette', en: 'Tag' },
    });
    update.manifest.migrations.push({ version: 2, entities: ['cards'] });
    await t.test('mise à jour : désactivation requise et ajout de droits séparé', async () => {
      await fixture.publish([fixture.artifact, update], 2);
      const current = await admin.call('admin/store');
      assert.equal(current.repositories[0].releases[0].update, true);
      const active = await review(update);
      assert.equal(active.requiresDeactivation, true);
      await admin.call(
        'admin/store/install',
        {
          reviewId: active.reviewId,
          confirmId: id,
          digest: active.release.digest,
          expectedPreviousDigest: active.previousDigest,
          acknowledgeSource: true,
          acknowledgeNewPermissions: true,
        },
        409,
      );
      await owner.call(`modules/${id}/deactivate`, {});
      await admin.call(`admin/modules/${id}`, { enabled: false });
      const next = await review(update);
      assert.deepEqual(next.newPermissions, [`${id}:export`]);
      await admin.call(
        'admin/store/install',
        {
          reviewId: next.reviewId,
          confirmId: id,
          digest: next.release.digest,
          expectedPreviousDigest: next.previousDigest,
          acknowledgeSource: true,
        },
        400,
      );
      // Simule un accord ancien, absent du manifeste précédent.
      await (
        await core.get(CoreDatabase).repository()
      ).transaction(async (repo) => {
        const current = await repo.role(org.id, role.id);
        await repo.saveRole(
          role.id,
          org.id,
          current.name,
          [...current.permissions, `${id}:export`],
          current.builtin,
        );
      });
      await install(next);
      const updatedRoles = await admin.call(`admin/organizations/${org.id}/roles`);
      assert.ok(!updatedRoles.find((r) => r.id === role.id).permissions.includes(`${id}:export`));
      const metadata = (await admin.call('admin/plugins')).plugins.find(
        (plugin) => plugin.id === id,
      );
      assert.equal(metadata.manifest.module.version, '1.1.0');
    });
    await t.test(
      'compatibilité Core/SDK/SQL et dépendance absente bloquent les installations',
      async () => {
        const incompatible = structuredClone(update);
        incompatible.manifest.module.version = '1.2.0';
        const engine = process.env.DB_ENGINE ?? 'postgresql',
          other = engine === 'postgresql' ? 'mysql' : 'postgresql';
        const coreBad = structuredClone(update);
        coreBad.manifest.module.version = '2.0.0';
        coreBad.manifest.module.core = '>=999.0.0';
        coreBad.manifest.sdk = '>=999.0.0';
        const missing = structuredClone(update);
        missing.manifest.module.version = '2.1.0';
        missing.manifest.module.dependencies = ['community.absent'];
        missing.manifest.dependencyVersions = { 'community.absent': '=1.0.0' };
        await fixture.publish(
          [
            fixture.artifact,
            update,
            { artifact: incompatible, engines: [other] },
            coreBad,
            missing,
          ],
          3,
        );
        const catalog = await admin.call('admin/store');
        const bad = catalog.repositories[0].releases.find((release) => release.version === '2.0.0');
        assert.ok(bad.reasons.includes('core'));
        assert.ok(bad.reasons.includes('sdk'));
        const deps = await review(missing);
        assert.ok(deps.reasons.includes('dependency:community.absent'));
        const next = await review(incompatible);
        assert.ok(next.reasons.includes('sql'));
        await admin.call(
          'admin/store/install',
          {
            reviewId: next.reviewId,
            confirmId: id,
            digest: next.release.digest,
            expectedPreviousDigest: next.previousDigest,
            acknowledgeSource: true,
          },
          409,
        );
      },
    );
    await t.test('revue obsolète, retrait du catalogue et downgrade refusés', async () => {
      const old = await review(fixture.artifact);
      assert.ok(old.reasons.includes('version'));
      await admin.call(
        'admin/store/install',
        {
          reviewId: old.reviewId,
          confirmId: id,
          digest: old.release.digest,
          expectedPreviousDigest: old.previousDigest,
          acknowledgeSource: true,
        },
        409,
      );
      const fresh = structuredClone(update);
      fresh.manifest.module.version = '1.3.0';
      await fixture.publish([update, fresh], 4);
      const pending = await review(fresh);
      await fixture.publish([update], 5);
      await admin.call(
        'admin/store/install',
        {
          reviewId: pending.reviewId,
          confirmId: id,
          digest: pending.release.digest,
          expectedPreviousDigest: pending.previousDigest,
          acknowledgeSource: true,
        },
        409,
      );
      const result = await admin.call('admin/store');
      assert.equal(result.repositories[0].state, 'ready');
    });
    await t.test(
      'checkpoint anti-rejeu et provenance persistent après redémarrage du Core',
      async () => {
        await bff.close();
        await core.close();
        await boot();
        await fixture.publish([fixture.artifact], 1);
        assert.equal((await admin.call('admin/store')).repositories[0].state, 'untrusted');
        await fixture.publish([update], 6);
        assert.equal((await admin.call('admin/store')).repositories[0].state, 'ready');
      },
    );
    await t.test(
      'Store arrêté : aucune dépendance pour sessions, modules et données existantes',
      async () => {
        await stopChild(child);
        assert.equal((await admin.call('admin/store')).repositories[0].state, 'unavailable');
        await admin.call(`admin/modules/${id}`, { enabled: true });
        await owner.call(`modules/${id}/activate`, {});
        const entries = await owner.call(`modules/${id}/data/cards`);
        assert.equal(entries.entries[0].values.title, 'Persisted');
        assert.equal(entries.entries[0].values.tag, '');
        assert.equal((await owner.call('session')).user.name, 'Store owner');
        const audit = await admin.call('admin/audit');
        assert.ok(audit.some((row) => row.event === 'store.plugin_installed'));
        assert.ok(!logs.join('').includes(token));
        assert.ok(!logs.join('').includes('PRIVATE KEY'));
      },
    );
  },
);
