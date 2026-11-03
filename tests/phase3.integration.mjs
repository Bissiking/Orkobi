import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import process from 'node:process';
import { test } from 'node:test';
import { createApplication } from '../apps/core/dist/application.js';
import { loadConfig } from '../apps/core/dist/config.js';
import { JsonLogger } from '../apps/core/dist/logger.js';
import { createBffApplication } from '../apps/bff/dist/application.js';
import { loadBffConfig } from '../apps/bff/dist/config.js';
import { JsonLogger as BffLogger } from '../apps/bff/dist/logger.js';
import { loadDatabaseConfig } from '../lib/database/dist/index.js';
import { totp } from '../apps/core/dist/platform/totp.js';
import { tokenHash } from '../apps/core/dist/platform/access.js';
import { createOidcProvider } from './helpers/oidc-provider.mjs';

assert.match(process.env.DB_NAME ?? '', /^orkobi_verify_[a-z0-9]+$/u);
const { fetch } = globalThis;
import { Pool } from './helpers/sql-pool.mjs';
const password = 'A long secret passphrase 2026!';

test(
  'Phase 3.1/3.2 : MFA, récupération, OIDC, sessions et API intégrations',
  { timeout: 120000 },
  async (t) => {
    const provider = await createOidcProvider(),
      sql = new Pool(loadDatabaseConfig(process.env, true));
    t.after(async () => {
      await sql.end();
      await provider.close();
    });
    const internal = randomBytes(32).toString('hex'),
      setupToken = randomBytes(32).toString('hex'),
      logs = [];
    const core = await createApplication(
      loadConfig({
        ...process.env,
        NODE_ENV: 'test',
        DB_ENABLED: 'true',
        SETUP_TOKEN: setupToken,
        INTERNAL_TOKEN: internal,
        SESSION_SECURE: 'false',
        OIDC_ISSUER: provider.issuer,
        OIDC_CLIENT_ID: 'orkobi-test',
        OIDC_REDIRECT_URI: 'http://127.0.0.1/oidc/callback',
      }),
      new JsonLogger((line) => logs.push(line)),
    );
    t.after(() => core.close());
    await core.listen(0, '127.0.0.1');
    const bff = await createBffApplication(
      {
        ...loadBffConfig({ INTERNAL_TOKEN: internal }),
        coreUrl: await core.getUrl(),
        coreTimeoutMs: 10000,
      },
      new BffLogger((line) => logs.push(line)),
    );
    t.after(() => bff.close());
    await bff.listen(0, '127.0.0.1');
    const base = await bff.getUrl();
    function client() {
      return {
        cookies: new Map(),
        csrf: '',
        async call(path, body, expected = 200) {
          const response = await fetch(`${base}/api/platform/${path}`, {
            method: body === undefined ? 'GET' : 'POST',
            headers: {
              cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '),
              'user-agent': 'Orkobi phase3 test',
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
          for (const cookie of response.headers.getSetCookie()) {
            const [key, value] = cookie.split(';')[0].split('=');
            if (value) this.cookies.set(key, value);
            else this.cookies.delete(key);
          }
          if (data.csrfToken) this.csrf = data.csrfToken;
          return data;
        },
      };
    }
    const operator = client();
    if (!(await operator.call('status')).initialized)
      await operator.call('setup', {
        setupToken,
        name: 'Operator',
        email: 'operator@example.org',
        password,
      });
    await operator.call('login', { email: 'operator@example.org', password });
    const adminId = (
      await operator.call('admin/users', {
        name: 'Phase3 Admin',
        email: 'phase3.admin@example.org',
        password,
        platformAdmin: true,
      })
    ).id;
    const userId = (
      await operator.call('admin/users', {
        name: 'Phase3 User',
        email: 'phase3.user@example.org',
        password,
        platformAdmin: false,
      })
    ).id;
    const admin = client(),
      user = client();
    await admin.call('login', { email: 'phase3.admin@example.org', password });
    await user.call('login', { email: 'phase3.user@example.org', password });
    const createOrg = (name) =>
      admin.call('admin/organizations', {
        name,
        kind: 'business',
        locale: 'fr',
        timezone: 'Europe/Paris',
        ownerId: adminId,
      });
    const org = await createOrg('Phase3 A'),
      otherOrg = await createOrg('Phase3 B');
    let secret, recovery, confirmedCode;
    await t.test('barrière interne : Core protégé, BFF authentifié, santé accessible', async () => {
      assert.equal((await fetch(`${await core.getUrl()}/platform/status`)).status, 403);
      assert.equal((await fetch(`${await core.getUrl()}/health`)).status, 200);
      assert.equal((await fetch(`${base}/api/bootstrap`)).status, 200);
      assert.equal(
        (await admin.call('capabilities')).capabilities.find(
          (item) => item.key === 'core.identity.oidc',
        ).availability,
        'available',
      );
    });
    await t.test(
      'MFA : inscription confirmée, révocation des autres sessions et codes uniques',
      async () => {
        const old = client();
        await old.call('login', { email: 'phase3.user@example.org', password });
        secret = (await user.call('mfa/enroll', {})).secret;
        assert.match(secret, /^[A-Z2-7]{32}$/u);
        assert.equal((await user.call('mfa/status')).pending, true);
        await user.call('mfa/confirm', { code: 'bad' }, 403);
        confirmedCode = totp(secret);
        recovery = (await user.call('mfa/confirm', { code: confirmedCode })).recoveryCodes;
        assert.equal(new Set(recovery).size, 10);
        assert.equal((await old.call('session')).user, null);
        await user.call('mfa/enroll', {}, 409);
        const rows = await sql.query(
          'SELECT code_hash FROM orkobi_core.mfa_recovery_codes WHERE user_id=$1',
          [userId],
        );
        assert.ok(rows.rows.every((row) => /^[a-f0-9]{64}$/u.test(row.code_hash)));
        assert.ok(!JSON.stringify(rows.rows).includes(recovery[0]));
      },
    );
    await t.test(
      'MFA : mot de passe seul insuffisant, rejeu TOTP et challenge refusés',
      async () => {
        const login = client(),
          challenge = (await login.call('login', { email: 'phase3.user@example.org', password }))
            .challenge;
        assert.ok(challenge);
        assert.equal(login.cookies.has('orkobi.local'), false);
        await login.call('mfa/login', { challenge, code: 'bad' }, 403);
        await login.call('mfa/login', { challenge, code: confirmedCode }, 403);
        await login.call('mfa/login', { challenge, code: totp(secret, Date.now() + 30000) });
        assert.equal((await login.call('session')).user.id, userId);
        await login.call('mfa/login', { challenge, code: recovery[0] }, 403);
        const next = client(),
          nextChallenge = (await next.call('login', { email: 'phase3.user@example.org', password }))
            .challenge;
        await next.call('mfa/login', { challenge: nextChallenge, code: recovery[0] });
        const retry = client(),
          retryChallenge = (
            await retry.call('login', { email: 'phase3.user@example.org', password })
          ).challenge;
        await retry.call('mfa/login', { challenge: retryChallenge, code: recovery[0] }, 403);
        assert.equal((await next.call('mfa/status')).recoveryCodesRemaining, 9);
      },
    );
    await t.test('MFA : challenge expiré et limitation de tentatives persistante', async () => {
      const login = client(),
        challenge = (await login.call('login', { email: 'phase3.user@example.org', password }))
          .challenge;
      for (let index = 0; index < 10; index++)
        await login.call('mfa/login', { challenge, code: 'bad' }, 403);
      await login.call('mfa/login', { challenge, code: recovery[1] }, 429);
      const expired = client(),
        expiredChallenge = (
          await expired.call('login', { email: 'phase3.user@example.org', password })
        ).challenge;
      await sql.query(
        "UPDATE orkobi_core.mfa_challenges SET expires_at=now()-interval '1 minute' WHERE user_id=$1",
        [userId],
      );
      await expired.call('mfa/login', { challenge: expiredChallenge, code: recovery[1] }, 403);
    });
    await t.test(
      'OIDC ne contourne pas la MFA locale ; désactivation avec second facteur',
      async () => {
        const login = client(),
          start = await login.call('oidc/start', {});
        const code = provider.code(start.url, {
          email: 'phase3.user@example.org',
          email_verified: true,
          sub: 'mfa-user',
        });
        const response = await login.call('oidc/callback', { state: start.state, code });
        assert.equal(response.mfaRequired, true);
        assert.equal(login.cookies.has('orkobi.local'), false);
        await login.call('mfa/login', { challenge: response.challenge, code: recovery[1] });
        await login.call('mfa/disable', { code: 'bad' }, 403);
        await login.call('mfa/disable', { code: recovery[2] });
        assert.equal((await login.call('mfa/status')).enabled, false);
        await user.call('login', { email: 'phase3.user@example.org', password });
        // Isole le budget de connexions du prochain scénario ; le rate-limit MFA a été vérifié ci-dessus.
        await sql.query('DELETE FROM orkobi_core.authentication_attempts WHERE key_hash=$1', [
          tokenHash('phase3.user@example.org'),
        ]);
      },
    );
    await t.test(
      'mot de passe : changement vérifié, reset administrateur et révocation',
      async () => {
        const other = client();
        await other.call('login', { email: 'phase3.user@example.org', password });
        const changed = 'Another long secret passphrase 2026!';
        await user.call('profile/password', { currentPassword: 'wrong', password: changed }, 403);
        await user.call('profile/password', { currentPassword: password, password: changed });
        assert.equal((await other.call('session')).user, null);
        await other.call('login', { email: 'phase3.user@example.org', password }, 401);
        await other.call('login', { email: 'phase3.user@example.org', password: changed });
        const sessions = await other.call('sessions');
        assert.ok(
          sessions.every((item) => item.lastSeenAt && item.userAgent === 'Orkobi phase3 test'),
        );
        await user.call(`admin/users/${adminId}/password`, { password }, 403);
        await admin.call(`admin/users/${userId}/password`, { password });
        assert.equal((await other.call('session')).user, null);
        await other.call('login', { email: 'phase3.user@example.org', password });
      },
    );
    await t.test('OIDC : PKCE, state lié au navigateur, signature, nonce et liaison', async () => {
      const login = client(),
        start = await login.call('oidc/start', {}),
        code = provider.code(start.url, {
          email: 'phase3.admin@example.org',
          email_verified: true,
        });
      await client().call('oidc/callback', { state: start.state, code }, 403);
      await login.call('oidc/callback', { state: '0'.repeat(64), code }, 403);
      await login.call('oidc/callback', { state: start.state, code });
      assert.equal((await login.call('session')).user.id, adminId);
      assert.equal((await login.call('oidc')).length, 1);
      await login.call('oidc/callback', { state: start.state, code }, 403);
      const explicit = await login.call('oidc/start', { link: true });
      await login.call('oidc/callback', {
        state: explicit.state,
        code: provider.code(explicit.url, { sub: 'explicit-link', email_verified: false }),
      });
      const identities = await login.call('oidc');
      assert.equal(identities.length, 2);
      await login.call('oidc/unlink', { issuer: provider.issuer, subject: 'explicit-link' });
      assert.equal((await login.call('oidc')).length, 1);
      for (const claims of [
        { nonce: 'wrong' },
        { iss: 'https://wrong.example' },
        { sub: 'unverified', email: 'phase3.admin@example.org', email_verified: false },
        { aud: ['orkobi-test', 'other'] },
      ]) {
        const attempt = client(),
          pending = await attempt.call('oidc/start', {});
        await attempt.call(
          'oidc/callback',
          { state: pending.state, code: provider.code(pending.url, claims) },
          403,
        );
      }
    });
    const integration = async (path, token, expected) => {
      const response = await fetch(`${base}/api/integration/${path}`, {
        headers: token
          ? { authorization: `Bearer ${token}`, 'x-orkobi-internal': 'browser-cannot-override' }
          : {},
      });
      const data = await response.json();
      assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`);
      return data;
    };
    let token, tokenId;
    await t.test(
      'intégrations : désactivées par défaut, jetons hashés et scopes fermés',
      async () => {
        assert.equal((await admin.call('admin/integrations')).enabled, false);
        await user.call('admin/integration-tokens', undefined, 401);
        await user.call('login', { email: 'phase3.user@example.org', password });
        await user.call(
          'admin/integration-tokens',
          { name: 'forbidden', scopes: ['organizations:read'] },
          403,
        );
        await admin.call('admin/integration-tokens', { name: 'bad', scopes: ['*'] }, 400);
        await admin.call(
          'admin/integration-tokens',
          { name: 'expired', scopes: ['organizations:read'], expiresAt: '2000-01-01' },
          400,
        );
        const created = await admin.call('admin/integration-tokens', {
          name: 'Bound token',
          organizationId: org.id,
          scopes: ['organizations:read'],
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        });
        token = created.token;
        tokenId = created.id;
        assert.match(token, /^okit_[a-f0-9]{64}$/u);
        assert.ok(!JSON.stringify(await admin.call('admin/integration-tokens')).includes(token));
        const hash = (
          await sql.query('SELECT token_hash FROM orkobi_core.integration_tokens WHERE id=$1', [
            tokenId,
          ])
        ).rows[0].token_hash;
        assert.match(hash, /^[a-f0-9]{64}$/u);
        assert.notEqual(hash, token);
        await integration('organizations', null, 401);
        await integration('organizations', token, 403);
      },
    );
    await t.test(
      'intégrations : activation, isolation par organisation, scopes et dernière utilisation',
      async () => {
        await admin.call('admin/integrations', { enabled: true });
        assert.deepEqual(
          (await integration('organizations', token, 200)).organizations.map((item) => item.id),
          [org.id],
        );
        await integration(`organizations/${org.id}`, token, 200);
        await integration(`organizations/${otherOrg.id}`, token, 403);
        await integration(`organizations/${org.id}/modules`, token, 403);
        const scoped = (
          await admin.call('admin/integration-tokens', {
            name: 'Module reader',
            organizationId: org.id,
            scopes: ['modules:read', 'audit:read'],
          })
        ).token;
        await integration(`organizations/${org.id}/modules`, scoped, 200);
        await integration(`organizations/${org.id}/audit`, scoped, 200);
        await integration('organizations', scoped, 403);
        await admin.call(`organizations/${org.id}/integrations`, { enabled: false });
        await integration(`organizations/${org.id}`, token, 403);
        assert.deepEqual((await integration('organizations', token, 200)).organizations, []);
        await admin.call(`organizations/${org.id}/integrations`, { enabled: true });
        assert.ok(
          (await admin.call('admin/integration-tokens')).find((item) => item.id === tokenId)
            .lastUsedAt,
        );
        assert.equal(
          (
            await fetch(`${await core.getUrl()}/integration/organizations`, {
              headers: { authorization: `Bearer ${token}` },
            })
          ).status,
          403,
        );
      },
    );
    await t.test('intégrations : expiration, révocation et kill switch immédiats', async () => {
      await sql.query(
        "UPDATE orkobi_core.integration_tokens SET expires_at=now()-interval '1 minute' WHERE id=$1",
        [tokenId],
      );
      await integration('organizations', token, 401);
      const fresh = await admin.call('admin/integration-tokens', {
        name: 'Revocable',
        scopes: ['organizations:read'],
      });
      await integration('organizations', fresh.token, 200);
      await admin.call(`admin/integration-tokens/${fresh.id}/revoke`, {});
      await integration('organizations', fresh.token, 401);
      const global = await admin.call('admin/integration-tokens', {
        name: 'Global',
        scopes: ['organizations:read'],
      });
      await admin.call('admin/integrations', { enabled: false });
      await integration('organizations', global.token, 403);
    });
    await t.test('audit : succès et refus persistés, aucun secret dans les journaux', async () => {
      const events = (await admin.call('admin/audit')).map((row) => row.event);
      for (const event of [
        'identity.mfa_enabled',
        'identity.mfa_disabled',
        'identity.password_changed',
        'identity.password_reset',
        'identity.oidc_linked',
        'integration.call',
        'integration.denied',
        'integration.token_revoked',
      ])
        assert.ok(events.includes(event), event);
      const audit = JSON.stringify(
        (await sql.query('SELECT * FROM orkobi_core.audit_events')).rows,
      );
      for (const value of [password, internal, token, secret, ...recovery]) {
        assert.ok(!logs.join('').includes(value));
        assert.ok(!audit.includes(value));
      }
    });
  },
);
