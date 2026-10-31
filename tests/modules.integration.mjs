import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
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
import {
  loadDatabaseConfig,
  ModuleDataError,
  PostgreSqlDatabase,
} from '../lib/database/dist/index.js';

const { fetch } = globalThis;
// Ce fichier ne doit être exécuté que sur la base dédiée du projet de test isolé.
assert.match(process.env.DB_NAME ?? '', /^orkobi_verify_[a-z0-9]+$/u);
const require = createRequire(new URL('../lib/database/package.json', import.meta.url));
const { Pool } = require('pg');
const setupToken = randomBytes(32).toString('hex');
const password = 'A long secret passphrase 2026!';

test(
  'Phase 2 : registre de modules, activation, données isolées et persistance',
  { timeout: 120000 },
  async (t) => {
    const sql = new Pool(loadDatabaseConfig(process.env, true));
    const runtime = new PostgreSqlDatabase(
      loadDatabaseConfig({ ...process.env, DB_ENABLED: 'true' }),
    );
    const config = loadConfig({
      ...process.env,
      NODE_ENV: 'test',
      DB_ENABLED: 'true',
      SETUP_TOKEN: setupToken,
      SESSION_SECURE: 'false',
    });
    const logs = [];
    const core = await createApplication(config, new JsonLogger((line) => logs.push(line)));
    await core.listen(0, '127.0.0.1');
    const bff = await createBffApplication(
      { ...loadBffConfig({}), coreUrl: await core.getUrl(), coreTimeoutMs: 10000 },
      new BffLogger((line) => logs.push(line)),
    );
    await bff.listen(0, '127.0.0.1');
    const base = await bff.getUrl();
    t.after(async () => {
      await bff.close();
      await core.close();
      await sql.end();
      await runtime.close();
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
    const operator = client(),
      owner = client(),
      other = client(),
      member = client();
    let orgId, otherOrgId, noteId;

    await t.test('état : base prête et capabilities décrites honnêtement', async () => {
      const status = (await operator.call('status')).data;
      assert.equal(status.databaseReady, true);
      assert.equal(status.modulesReady, true);
      if (!status.initialized)
        await operator.call('setup', {
          setupToken,
          name: 'Operator',
          email: 'operator@example.org',
          password,
        });
      await operator.call('login', { email: 'operator@example.org', password });
      const { data } = await operator.call('capabilities');
      const byKey = new Map(data.capabilities.map((capability) => [capability.key, capability]));
      assert.equal(byKey.get('core.modules').availability, 'available');
      assert.equal(byKey.get('core.data.sql').availability, 'limited');
      assert.equal(byKey.get('core.identity.oidc').availability, 'unavailable');
      assert.equal(byKey.get('core.events').availability, 'unavailable');
      assert.ok(
        data.capabilities.every((capability) => typeof capability.description === 'string'),
      );
    });

    await t.test(
      'registre administrateur : orkobi.demo synchronisé, désactivé par défaut',
      async () => {
        const { data } = await operator.call('admin/modules');
        const demo = data.modules.find((module) => module.id === 'orkobi.demo');
        assert.ok(demo);
        assert.equal(demo.version, '0.1.0');
        assert.equal(demo.enabled, false);
        assert.equal(demo.organizationCount, 0);
        assert.deepEqual(demo.missingCapabilities, []);
        assert.deepEqual(demo.unsatisfiedDependencies, []);
      },
    );

    await t.test('activation plateforme puis organisation : cycle complet', async () => {
      const ownerId = (
        await operator.call('admin/users', {
          name: 'Owner',
          email: 'owner@example.org',
          password,
          platformAdmin: false,
        })
      ).data.id;
      orgId = (
        await operator.call('admin/organizations', {
          name: 'Module Org',
          kind: 'business',
          locale: 'fr',
          timezone: 'Europe/Paris',
          ownerId,
        })
      ).data.id;
      await owner.call('login', { email: 'owner@example.org', password });
      await owner.call(`organizations/${orgId}/select`, {});
      // Désactivé au niveau plateforme : l'organisation ne peut pas l'activer.
      await owner.call('modules/orkobi.demo/activate', {}, 409);
      await operator.call('admin/modules/orkobi.demo', { enabled: true });
      const before = (await owner.call('modules')).data.modules.find((m) => m.id === 'orkobi.demo');
      assert.equal(before.enabled, true);
      assert.equal(before.active, false);
      assert.deepEqual(before.missingCapabilities, []);
      await owner.call('modules/orkobi.demo/activate', {});
      const after = (await owner.call('modules')).data.modules.find((m) => m.id === 'orkobi.demo');
      assert.equal(after.active, true);
      const admin = (await operator.call('admin/modules')).data.modules.find(
        (m) => m.id === 'orkobi.demo',
      );
      assert.equal(admin.organizationCount, 1);
    });

    await t.test('données du module : création, lecture, mise à jour validées', async () => {
      const created = (
        await owner.call('modules/orkobi.demo/data/notes', { title: 'Première note', content: 'A' })
      ).data.entry;
      noteId = created.id;
      assert.match(noteId, /^[a-f0-9-]{36}$/u);
      assert.deepEqual(created.values, { title: 'Première note', content: 'A' });
      const list = (await owner.call('modules/orkobi.demo/data/notes')).data.entries;
      assert.equal(list.length, 1);
      assert.equal(list[0].id, noteId);
      const updated = (
        await owner.call(`modules/orkobi.demo/data/notes/${noteId}`, {
          title: 'Note mise à jour',
          content: 'B',
        })
      ).data.entry;
      assert.deepEqual(updated.values, { title: 'Note mise à jour', content: 'B' });
      for (const [body, expected] of [
        [{ content: 'sans titre' }, 400],
        [{ title: '' }, 400],
        [{ title: 'x'.repeat(121) }, 400],
        [{ title: 'ok', content: 'x'.repeat(4001) }, 400],
        [{ title: 'ok', inconnu: 'x' }, 400],
        [{ title: `ok${String.fromCharCode(0)}` }, 400],
      ])
        await owner.call('modules/orkobi.demo/data/notes', body, expected);
      await owner.call('modules/orkobi.demo/data/inconnu', { title: 'x' }, 404);
      await owner.call('modules/absolu.demo/data/notes', { title: 'x' }, 404);
      await owner.call(`modules/orkobi.demo/data/notes/${'0'.repeat(36)}`, { title: 'x' }, 400);
      const rows = await sql.query('SELECT organization_id, created_by FROM orkobi_demo.notes');
      assert.equal(rows.rows.length, 1);
      assert.equal(rows.rows[0].organization_id, orgId);
    });

    await t.test(
      'adaptateur SQL : contexte lié, rollback réel et transaction en lecture seule',
      async () => {
        const adapter = runtime.moduleAdapter({
          moduleId: 'orkobi.demo',
          tables: ['orkobi_demo.notes'],
        });
        const context = { organizationId: orgId, userId: randomUUID() };
        const id = randomUUID();
        const statement = {
          text: 'INSERT INTO orkobi_demo.notes (id, organization_id, title) VALUES ($1,$2,$3) RETURNING id',
          parameters: [id, orgId, 'Rollback probe'],
        };
        const failure = new Error('rollback probe');
        await assert.rejects(
          adapter.transaction(context, async (tx) => {
            await tx.execute(statement);
            throw failure;
          }),
          (error) => error === failure,
        );
        assert.equal(
          (await sql.query('SELECT id FROM orkobi_demo.notes WHERE id=$1', [id])).rowCount,
          0,
        );
        await assert.rejects(
          adapter.transaction(context, (tx) => tx.execute(statement), { readOnly: true }),
          (error) => error.code === '25006',
        );
        await assert.rejects(
          adapter.transaction(context, (tx) =>
            tx.execute({
              text: 'SELECT id FROM orkobi_demo.notes WHERE organization_id=$1',
              parameters: [randomUUID()],
            }),
          ),
          ModuleDataError,
        );
        const entries = await adapter.transaction(
          context,
          (tx) =>
            tx.execute({
              text: 'SELECT id FROM orkobi_demo.notes WHERE organization_id=$1',
              parameters: [orgId],
            }),
          { readOnly: true, isolationLevel: 'repeatable read' },
        );
        assert.deepEqual(
          entries.rows.map((entry) => entry.id),
          [noteId],
        );
      },
    );

    await t.test(
      'transaction : un échec de l audit annule création, modification et suppression',
      async () => {
        await sql.query(`CREATE FUNCTION orkobi_demo.reject_note_audit() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            IF NEW.event LIKE 'module.orkobi.demo.notes.%' THEN RAISE EXCEPTION 'audit failure probe'; END IF;
            RETURN NEW;
          END $$;
          CREATE TRIGGER reject_note_audit BEFORE INSERT ON orkobi_core.audit_events
          FOR EACH ROW EXECUTE FUNCTION orkobi_demo.reject_note_audit();`);
        try {
          await owner.call('modules/orkobi.demo/data/notes', { title: 'Must roll back' }, 503);
          await owner.call(
            `modules/orkobi.demo/data/notes/${noteId}`,
            { title: 'Must roll back' },
            503,
          );
          await owner.call(`modules/orkobi.demo/data/notes/${noteId}/delete`, {}, 503);
          const rows = await sql.query('SELECT id, title, content FROM orkobi_demo.notes');
          assert.deepEqual(rows.rows, [{ id: noteId, title: 'Note mise à jour', content: 'B' }]);
        } finally {
          await sql.query(
            'DROP TRIGGER reject_note_audit ON orkobi_core.audit_events; DROP FUNCTION orkobi_demo.reject_note_audit();',
          );
        }
      },
    );

    await t.test(
      'organisation suspendue : les sessions existantes perdent l accès aux données',
      async () => {
        await sql.query('UPDATE orkobi_core.organizations SET active=false WHERE id=$1', [orgId]);
        try {
          await owner.call('modules/orkobi.demo/data/notes', undefined, 403);
          await owner.call('modules/orkobi.demo/data/notes', { title: 'x' }, 403);
          await owner.call(`modules/orkobi.demo/data/notes/${noteId}`, { title: 'x' }, 403);
          await owner.call(`modules/orkobi.demo/data/notes/${noteId}/delete`, {}, 403);
        } finally {
          await sql.query('UPDATE orkobi_core.organizations SET active=true WHERE id=$1', [orgId]);
        }
      },
    );

    await t.test('suppression : donnée retirée et audit enregistré', async () => {
      const created = (await owner.call('modules/orkobi.demo/data/notes', { title: 'À supprimer' }))
        .data.entry;
      await owner.call(`modules/orkobi.demo/data/notes/${created.id}/delete`, {});
      const entries = (await owner.call('modules/orkobi.demo/data/notes')).data.entries;
      assert.deepEqual(
        entries.map((entry) => entry.id),
        [noteId],
      );
      await owner.call(`modules/orkobi.demo/data/notes/${created.id}/delete`, {}, 404);
    });

    await t.test(
      'isolation : une seconde organisation ne voit ni ne touche les notes',
      async () => {
        const otherId = (
          await operator.call('admin/users', {
            name: 'Other',
            email: 'other@example.org',
            password,
            platformAdmin: false,
          })
        ).data.id;
        otherOrgId = (
          await operator.call('admin/organizations', {
            name: 'Other Org',
            kind: 'association',
            locale: 'en',
            timezone: 'Europe/London',
            ownerId: otherId,
          })
        ).data.id;
        await other.call('login', { email: 'other@example.org', password });
        await other.call(`organizations/${otherOrgId}/select`, {});
        await other.call('modules/orkobi.demo/activate', {});
        const entry = (
          await other.call('modules/orkobi.demo/data/notes', { title: 'Other note', content: '' })
        ).data.entry;
        assert.notEqual(entry.id, noteId);
        const theirs = (await other.call('modules/orkobi.demo/data/notes')).data.entries;
        assert.equal(theirs.length, 1);
        assert.equal(theirs[0].values.title, 'Other note');
        const ours = (await owner.call('modules/orkobi.demo/data/notes')).data.entries;
        assert.equal(ours.length, 1);
        assert.equal(ours[0].id, noteId);
        await owner.call(
          `modules/orkobi.demo/data/notes/${entry.id}`,
          { title: 'x', content: '' },
          404,
        );
        await owner.call(`modules/orkobi.demo/data/notes/${entry.id}/delete`, {}, 404);
        await other.call(`modules/orkobi.demo/data/notes/${noteId}/delete`, {}, 404);
      },
    );

    await t.test('rôles : member ne lit pas les données de module ni n active', async () => {
      await operator.call('admin/users', {
        name: 'Member',
        email: 'notes.member@example.org',
        password,
        platformAdmin: false,
      });
      const roles = (await owner.call(`organizations/${orgId}/roles`)).data;
      const memberRole = roles.find((role) => role.builtin === 'member');
      assert.ok(memberRole.permissions.includes('modules:read'));
      assert.ok(!memberRole.permissions.includes('demo:read'));
      await owner.call(`organizations/${orgId}/members`, {
        email: 'notes.member@example.org',
        roleId: memberRole.id,
        active: true,
      });
      await member.call('login', { email: 'notes.member@example.org', password });
      await member.call(`organizations/${orgId}/select`, {});
      const modules = (await member.call('modules')).data.modules;
      assert.ok(modules.some((module) => module.id === 'orkobi.demo' && module.active));
      await member.call('modules/orkobi.demo/data/notes', undefined, 403);
      await member.call('modules/orkobi.demo/data/notes', { title: 'x' }, 403);
      await member.call('modules/orkobi.demo/deactivate', {}, 403);
      await member.call(
        `organizations/${orgId}/roles`,
        { name: 'X', permissions: ['demo:write'] },
        403,
      );
    });

    await t.test(
      'désactivation : accès refusé, données conservées, réactivation intacte',
      async () => {
        await owner.call('modules/orkobi.demo/deactivate', {});
        assert.equal(
          (await owner.call('modules')).data.modules.find((m) => m.id === 'orkobi.demo').active,
          false,
        );
        await owner.call('modules/orkobi.demo/data/notes', undefined, 403);
        await owner.call('modules/orkobi.demo/data/notes', { title: 'x' }, 403);
        const rows = await sql.query('SELECT count(*)::integer AS count FROM orkobi_demo.notes');
        assert.equal(rows.rows[0].count, 2);
        await owner.call('modules/orkobi.demo/activate', {});
        const entries = (await owner.call('modules/orkobi.demo/data/notes')).data.entries;
        assert.equal(entries.length, 1);
        assert.equal(entries[0].id, noteId);
      },
    );

    await t.test(
      'contrôle plateforme : désactivation bloquée tant qu une organisation est active',
      async () => {
        await operator.call('admin/modules/orkobi.demo', { enabled: false }, 409);
        await owner.call('modules/orkobi.demo/deactivate', {});
        await operator.call('admin/modules/orkobi.demo', { enabled: false }, 409);
        await other.call('modules/orkobi.demo/deactivate', {});
        await operator.call('admin/modules/orkobi.demo', { enabled: false });
        const off = (await operator.call('admin/modules')).data.modules.find(
          (m) => m.id === 'orkobi.demo',
        );
        assert.equal(off.enabled, false);
        await owner.call('modules/orkobi.demo/activate', {}, 409);
        const rows = await sql.query('SELECT count(*)::integer AS count FROM orkobi_demo.notes');
        assert.equal(rows.rows[0].count, 2);
        await operator.call('admin/modules/orkobi.demo', { enabled: true });
      },
    );

    await t.test('audit : opérations de module journalisées sans secrets', async () => {
      const events = (await owner.call(`organizations/${orgId}/audit`)).data.map(
        (row) => row.event,
      );
      assert.ok(events.includes('module.organization_activated'));
      assert.ok(events.includes('module.organization_deactivated'));
      assert.ok(events.includes('module.orkobi.demo.notes.created'));
      assert.ok(events.includes('module.orkobi.demo.notes.updated'));
      assert.ok(events.includes('module.orkobi.demo.notes.deleted'));
      const adminEvents = (await operator.call('admin/audit')).data.map((row) => row.event);
      assert.ok(adminEvents.includes('module.enabled'));
      assert.ok(adminEvents.includes('module.disabled'));
      const all = await sql.query('SELECT * FROM orkobi_core.audit_events');
      assert.ok(!JSON.stringify(all.rows).includes(password));
      assert.ok(!logs.join('').includes(password));
      assert.ok(!logs.join('').includes(setupToken));
    });
  },
);
