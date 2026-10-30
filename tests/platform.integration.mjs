import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import process from 'node:process';
import { test } from 'node:test';
import { createApplication } from '../apps/core/dist/application.js';
import { loadConfig } from '../apps/core/dist/config.js';
import { JsonLogger } from '../apps/core/dist/logger.js';
import { createBffApplication } from '../apps/bff/dist/application.js';
import { loadBffConfig } from '../apps/bff/dist/config.js';
import { JsonLogger as BffLogger } from '../apps/bff/dist/logger.js';
import { loadDatabaseConfig } from '../lib/database/dist/index.js';
import { CoreSdkFactory } from '../apps/core/dist/services/sdk-factory.js';

const { fetch } = globalThis;
assert.match(process.env.DB_NAME ?? '', /^orkobi_verify_[a-z0-9]+$/u);
const require = createRequire(new URL('../lib/database/package.json', import.meta.url));
const { Pool } = require('pg');
const setupToken = randomBytes(32).toString('hex');
const password = 'A long secret passphrase 2026!';

test(
  'Phase 1 : HTTP réel, identité persistante et isolation des organisations',
  { timeout: 120000 },
  async (t) => {
    const sql = new Pool(loadDatabaseConfig(process.env, true));
    const runtimeSql = new Pool(loadDatabaseConfig({ ...process.env, DB_ENABLED: 'true' }));
    const logs = [];
    const config = loadConfig({
      ...process.env,
      NODE_ENV: 'test',
      DB_ENABLED: 'true',
      SETUP_TOKEN: setupToken,
      SESSION_SECURE: 'false',
    });
    let core = await createApplication(config, new JsonLogger((line) => logs.push(line)));
    await core.listen(0, '127.0.0.1');
    let bff = await createBffApplication(
      { ...loadBffConfig({}), coreUrl: await core.getUrl(), coreTimeoutMs: 10000 },
      new BffLogger((line) => logs.push(line)),
    );
    await bff.listen(0, '127.0.0.1');
    let base = await bff.getUrl();
    t.after(async () => {
      await bff.close();
      await core.close();
      await Promise.all([sql.end(), runtimeSql.end()]);
    });
    function client() {
      return {
        cookie: '',
        csrf: '',
        async call(path, body, expected = 200, extra = {}) {
          const response = await fetch(`${base}/api/platform/${path}`, {
            method: body === undefined ? 'GET' : 'POST',
            headers: {
              ...(this.cookie ? { cookie: this.cookie } : {}),
              ...(body === undefined
                ? {}
                : {
                    origin: base,
                    'content-type': 'application/json',
                    'x-orkobi-request': '1',
                    'x-csrf-token': this.csrf,
                  }),
              ...extra,
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          });
          const data = await response.json();
          assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`);
          const cookie = response.headers.get('set-cookie');
          if (cookie) this.cookie = cookie.split(';')[0];
          if (data.csrfToken) this.csrf = data.csrfToken;
          return { data, response };
        },
      };
    }
    const admin = client(),
      alpha = client(),
      beta = client(),
      member = client(),
      manager = client();
    let adminId, alphaId, betaId, memberId, managerId, orgA, orgB, rolesA, rolesB, managerRole;
    const newUser = async (name, email) =>
      (await admin.call('admin/users', { name, email, password, platformAdmin: false })).data.id;
    const login = async (user, email) => user.call('login', { email, password });

    await t.test(
      'installation atomique : secret requis, une seule initialisation concurrente',
      async () => {
        assert.deepEqual((await admin.call('status')).data, {
          initialized: false,
          databaseReady: true,
        });
        await admin.call(
          'setup',
          { setupToken: 'incorrect', name: 'Operator', email: 'operator@example.org', password },
          403,
        );
        const body = { setupToken, name: 'Operator', email: 'operator@example.org', password };
        const responses = await Promise.all(
          [0, 1].map(() =>
            fetch(`${base}/api/platform/setup`, {
              method: 'POST',
              headers: {
                origin: base,
                'content-type': 'application/json',
                'x-orkobi-request': '1',
              },
              body: JSON.stringify(body),
            }),
          ),
        );
        assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
        assert.equal(
          (await sql.query('SELECT count(*)::integer AS count FROM orkobi_core.users')).rows[0]
            .count,
          1,
        );
        await login(admin, 'operator@example.org');
        const auth = (await admin.call('session')).data;
        adminId = auth.user.id;
        assert.equal(auth.user.platformAdmin, true);
        assert.equal(auth.user.passwordHash, undefined);
      },
    );
    await t.test('cookies, CSRF et refus des comptes absents/invalides', async () => {
      const another = client();
      const { response } = await login(another, 'operator@example.org');
      assert.match(response.headers.get('set-cookie'), /HttpOnly/u);
      assert.match(response.headers.get('set-cookie'), /SameSite=Strict/u);
      assert.match(response.headers.get('set-cookie'), /Path=\//u);
      assert.ok(!response.headers.get('set-cookie').includes('Secure'));
      await another.call('logout', {}, 403, { 'x-csrf-token': 'wrong' });
      await another.call('logout', {}, 403, { origin: 'https://hostile.example' });
      await another.call('logout', {}, 403, { 'x-orkobi-request': '0' });
      await client().call('login', { email: 'missing@example.org', password }, 401);
      await client().call('login', { email: 'operator@example.org', password: 'incorrect' }, 401);
      await another.call('logout', {});
      assert.equal((await another.call('session')).data.user, null);
      await another.call('admin/users', undefined, 401);
    });
    await t.test(
      'administration : comptes, deux organisations et aucun accès implicite',
      async () => {
        alphaId = await newUser('Alpha admin', 'alpha@example.org');
        betaId = await newUser('Beta admin', 'beta@example.org');
        memberId = await newUser('Shared member', 'member@example.org');
        managerId = await newUser('Delegated manager', 'manager@example.org');
        orgA = (
          await admin.call('admin/organizations', {
            name: 'Alpha',
            kind: 'business',
            locale: 'fr',
            timezone: 'Europe/Paris',
            ownerId: alphaId,
          })
        ).data;
        orgB = (
          await admin.call('admin/organizations', {
            name: 'Beta',
            kind: 'association',
            locale: 'en',
            timezone: 'Europe/London',
            ownerId: betaId,
          })
        ).data;
        rolesA = (await admin.call(`admin/organizations/${orgA.id}/roles`)).data;
        rolesB = (await admin.call(`admin/organizations/${orgB.id}/roles`)).data;
        assert.equal((await admin.call('admin/organizations')).data.length, 2);
        await admin.call(`organizations/${orgA.id}`, undefined, 403);
        await login(alpha, 'alpha@example.org');
        await login(beta, 'beta@example.org');
        assert.deepEqual(
          (await alpha.call('session')).data.organizations.map((org) => org.id),
          [orgA.id],
        );
        await alpha.call('admin/users', undefined, 403);
      },
    );
    await t.test(
      'isolation HTTP : lectures, paramètres, membres, rôles et audit inter-organisations refusés',
      async () => {
        for (const suffix of ['', '/members', '/roles', '/audit'])
          await alpha.call(`organizations/${orgB.id}${suffix}`, undefined, 403);
        await alpha.call(`organizations/${orgB.id}`, { ...orgB, name: 'Intrusion' }, 403);
        await alpha.call(`organizations/${orgB.id}/select`, {}, 403);
        await alpha.call(`organizations/${orgA.id}`, {
          ...orgA,
          name: 'Alpha updated',
          organizationId: orgB.id,
        });
        assert.equal((await beta.call(`organizations/${orgB.id}`)).data.name, 'Beta');
        assert.equal((await alpha.call(`organizations/${orgA.id}`)).data.name, 'Alpha updated');
        await alpha.call(
          `organizations/${orgA.id}/members`,
          {
            email: 'member@example.org',
            roleId: rolesB.find((role) => role.builtin === 'admin').id,
            active: true,
          },
          403,
        );
      },
    );
    await t.test(
      'multi-appartenance et sélection serveur sans droit de modification implicite',
      async () => {
        for (const [org, roles] of [
          [orgA, rolesA],
          [orgB, rolesB],
        ])
          await admin.call(`admin/organizations/${org.id}/members`, {
            email: 'member@example.org',
            roleId: roles.find((role) => role.builtin === 'member').id,
            active: true,
          });
        await login(member, 'member@example.org');
        assert.equal((await member.call('session')).data.organizations.length, 2);
        await member.call(`organizations/${orgA.id}/select`, {});
        assert.equal((await member.call('session')).data.activeOrganizationId, orgA.id);
        await member.call(`organizations/${orgB.id}/select`, {});
        assert.equal((await member.call('session')).data.activeOrganizationId, orgB.id);
        await member.call(`organizations/${orgA.id}`, { ...orgA, name: 'Forbidden' }, 403);
        await member.call(`organizations/${orgA.id}/members`, undefined, 403);
        const sdk = core
          .get(CoreSdkFactory)
          .forAuthorizedContext({ userId: memberId, organizationId: orgA.id });
        assert.equal((await sdk.identity.currentUser()).value.id, memberId);
        assert.deepEqual(await sdk.permissions.can('organization:write'), {
          ok: true,
          value: false,
        });
        assert.deepEqual(await sdk.permissions.can('organization:read'), { ok: true, value: true });
      },
    );
    await t.test(
      'délégation des rôles sans élévation de privilèges et révocation immédiate',
      async () => {
        const permissions = ['organization:read', 'members:read', 'members:write', 'roles:write'];
        managerRole = (
          await alpha.call(`organizations/${orgA.id}/roles`, { name: 'Delegated', permissions })
        ).data.id;
        await alpha.call(`organizations/${orgA.id}/members`, {
          email: 'manager@example.org',
          roleId: managerRole,
          active: true,
        });
        await login(manager, 'manager@example.org');
        await manager.call(
          `organizations/${orgA.id}/roles`,
          { name: 'Escalation', permissions: ['audit:read'] },
          403,
        );
        await manager.call(
          `organizations/${orgA.id}/roles`,
          {
            id: rolesA.find((role) => role.builtin === 'admin').id,
            name: 'Hijacked',
            permissions: [],
          },
          403,
        );
        await manager.call(
          `organizations/${orgA.id}/members`,
          {
            email: 'member@example.org',
            roleId: rolesA.find((role) => role.builtin === 'admin').id,
            active: true,
          },
          403,
        );
        await manager.call(`organizations/${orgB.id}/members`, undefined, 403);
        await alpha.call(`organizations/${orgA.id}/members`, {
          email: 'manager@example.org',
          roleId: rolesA.find((role) => role.builtin === 'member').id,
          active: true,
        });
        await manager.call(`organizations/${orgA.id}/members`, undefined, 403);
      },
    );
    await t.test(
      'derniers administrateurs protégés, désactivation et sessions révoquées',
      async () => {
        await admin.call(
          `admin/users/${adminId}`,
          { name: 'Operator', active: false, platformAdmin: true },
          409,
        );
        await alpha.call(
          `organizations/${orgA.id}/members`,
          {
            email: 'alpha@example.org',
            roleId: rolesA.find((role) => role.builtin === 'member').id,
            active: true,
          },
          409,
        );
        await admin.call(
          `admin/users/${alphaId}`,
          { name: 'Alpha admin', active: false, platformAdmin: false },
          409,
        );
        await alpha.call(`organizations/${orgA.id}/members`, {
          email: 'member@example.org',
          roleId: rolesA.find((role) => role.builtin === 'admin').id,
          active: true,
        });
        await admin.call(`admin/users/${alphaId}`, {
          name: 'Alpha admin',
          active: false,
          platformAdmin: false,
        });
        assert.equal((await alpha.call('session')).data.user, null);
        await alpha.call(`organizations/${orgA.id}`, undefined, 401);
        await member.call(`organizations/${orgA.id}/members`);
      },
    );
    await t.test('persistance des sessions après redémarrage des applications', async () => {
      await bff.close();
      await core.close();
      core = await createApplication(config, new JsonLogger((line) => logs.push(line)));
      await core.listen(0, '127.0.0.1');
      bff = await createBffApplication(
        { ...loadBffConfig({}), coreUrl: await core.getUrl(), coreTimeoutMs: 10000 },
        new BffLogger((line) => logs.push(line)),
      );
      await bff.listen(0, '127.0.0.1');
      base = await bff.getUrl();
      assert.equal((await member.call('session')).data.user.id, memberId);
      assert.equal((await admin.call('session')).data.user.id, adminId);
      assert.equal((await beta.call('session')).data.organizations[0].id, orgB.id);
    });
    await t.test('révocation et expirations absolue/inactive appliquées côté serveur', async () => {
      const sessions = (await beta.call('sessions')).data;
      await member.call('sessions/revoke', { sessionId: sessions[0].id }, 404);
      await beta.call('sessions/revoke', {
        sessionId: sessions.find((session) => session.current).id,
      });
      await beta.call('admin/users', undefined, 401);
      await login(beta, 'beta@example.org');
      await sql.query(
        "UPDATE orkobi_core.sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",
        [betaId],
      );
      await beta.call(`organizations/${orgB.id}`, undefined, 401);
      await login(beta, 'beta@example.org');
      await sql.query(
        "UPDATE orkobi_core.sessions SET last_seen_at=now()-interval '31 minutes' WHERE user_id=$1",
        [betaId],
      );
      await beta.call(`organizations/${orgB.id}`, undefined, 401);
    });
    await t.test('limitation de tentatives, cookies HTTPS et audit sans secrets', async () => {
      for (let i = 0; i < 10; i++)
        await client().call('login', { email: 'brute@example.org', password: 'wrong' }, 401);
      await client().call('login', { email: 'brute@example.org', password: 'wrong' }, 429);
      const secure = await createApplication(
        { ...config, platform: { setupToken, secureCookies: true } },
        new JsonLogger(() => {}),
      );
      await secure.listen(0, '127.0.0.1');
      try {
        const response = await fetch(`${await secure.getUrl()}/platform/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-orkobi-request': '1' },
          body: JSON.stringify({ email: 'operator@example.org', password }),
        });
        assert.equal(response.status, 200);
        assert.match(response.headers.get('set-cookie'), /^__Host-orkobi=/u);
        assert.match(response.headers.get('set-cookie'), /; Secure;/u);
      } finally {
        await secure.close();
      }
      const rows = (await sql.query('SELECT * FROM orkobi_core.audit_events')).rows;
      assert.ok(rows.some((row) => row.event === 'instance.initialized'));
      assert.ok(rows.some((row) => row.event === 'organization.membership_saved'));
      assert.ok(!JSON.stringify(rows).includes(password));
      assert.ok(!logs.join('').includes(password));
      assert.ok(!logs.join('').includes(setupToken));
      const users = (await sql.query('SELECT password_hash FROM orkobi_core.users')).rows;
      assert.ok(users.every((user) => user.password_hash.startsWith('scrypt:131072:8:1:')));
      assert.equal(new Set(users.map((user) => user.password_hash)).size, users.length);
      for (const statement of [
        "UPDATE orkobi_core.audit_events SET event='tampered'",
        'DELETE FROM orkobi_core.audit_events',
      ])
        await assert.rejects(runtimeSql.query(statement), (error) => error.code === '42501');
      await assert.rejects(
        runtimeSql.query(
          'UPDATE orkobi_core.memberships SET role_id=$1 WHERE organization_id=$2 AND user_id=$3',
          [rolesB[0].id, orgA.id, managerId],
        ),
        (error) => error.code === '23503',
      );
    });
    await t.test(
      'changements concurrents : un administrateur plateforme actif demeure',
      async () => {
        const backupId = (
          await admin.call('admin/users', {
            name: 'Backup administrator',
            email: 'backup@example.org',
            password,
            platformAdmin: true,
          })
        ).data.id;
        const backup = client();
        await login(backup, 'backup@example.org');
        const results = await Promise.all(
          [
            [admin, adminId],
            [backup, backupId],
          ].map(([actor, id]) =>
            fetch(`${base}/api/platform/admin/users/${id}`, {
              method: 'POST',
              headers: {
                origin: base,
                'content-type': 'application/json',
                'x-orkobi-request': '1',
                'x-csrf-token': actor.csrf,
                cookie: actor.cookie,
              },
              body: JSON.stringify({ name: 'Administrator', active: true, platformAdmin: false }),
            }),
          ),
        );
        assert.deepEqual(results.map((response) => response.status).sort(), [200, 409]);
        assert.equal(
          (
            await sql.query(
              'SELECT count(*)::integer AS count FROM orkobi_core.users WHERE active AND platform_admin',
            )
          ).rows[0].count,
          1,
        );
      },
    );
  },
);
