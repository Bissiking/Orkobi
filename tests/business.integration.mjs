import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import process from 'node:process';
import { test } from 'node:test';
import { createApplication } from '../apps/core/dist/application.js';
import { loadConfig } from '../apps/core/dist/config.js';
import { JsonLogger } from '../apps/core/dist/logger.js';
import { createBffApplication } from '../apps/bff/dist/application.js';
import { loadBffConfig } from '../apps/bff/dist/config.js';
import { JsonLogger as BffLogger } from '../apps/bff/dist/logger.js';
import { loadDatabaseConfig } from '../lib/database/dist/index.js';
import { Pool } from './helpers/sql-pool.mjs';
const { fetch } = globalThis;
assert.match(process.env.DB_NAME ?? '', /^orkobi_verify_[a-z0-9]+$/u);
const password = 'A long secret passphrase 2026!',
  setupToken = randomBytes(32).toString('hex');
test(
  'Phase 7 : neuf modules, HTTP Core/BFF et vrais services SQL isolés',
  { timeout: 180000 },
  async (t) => {
    const logs = [],
      sql = new Pool(loadDatabaseConfig(process.env, true));
    const core = await createApplication(
      loadConfig({
        ...process.env,
        NODE_ENV: 'test',
        DB_ENABLED: 'true',
        SETUP_TOKEN: setupToken,
        SESSION_SECURE: 'false',
      }),
      new JsonLogger((line) => logs.push(line)),
    );
    await core.listen(0, '127.0.0.1');
    const bff = await createBffApplication(
      { ...loadBffConfig({}), coreUrl: await core.getUrl(), coreTimeoutMs: 15000 },
      new BffLogger((line) => logs.push(line)),
    );
    await bff.listen(0, '127.0.0.1');
    const base = await bff.getUrl();
    t.after(async () => {
      await bff.close();
      await core.close();
      await sql.end();
    });
    function client() {
      return {
        cookie: '',
        csrf: '',
        async call(path, body, expected = 200) {
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
        async save(path, values, extra = {}, expected = 200) {
          return this.call(
            `business/${path}`,
            { idempotencyKey: randomUUID(), values, ...extra },
            expected,
          );
        },
        async act(record, action, extra = {}, expected = 200) {
          return this.call(
            `business/${record.module}/${record.entity}/${record.id}/${action}`,
            { idempotencyKey: randomUUID(), expectedRevision: record.revision, ...extra },
            expected,
          );
        },
      };
    }
    const root = client(),
      owner = client(),
      other = client(),
      approver = client();
    let org,
      orgB,
      ownerRole,
      approverRole,
      contact,
      foreignContact,
      product,
      quote,
      invoice,
      warehouse,
      project,
      task,
      member,
      due,
      employee,
      leave,
      file;
    const customer = {
      name: 'Client Alpha',
      kind: 'company',
      stage: 'customer',
      address: '10 rue du Test',
      postalCode: '75001',
      city: 'Paris',
      country: 'FR',
      siren: '123456789',
      email: 'client@example.org',
    };
    const productValues = {
      sku: 'BIEN-1',
      name: 'Produit Alpha',
      kind: 'goods',
      price: '0.10',
      vatRate: '20',
      unit: 'unité',
    };
    const defs = [
      'crm',
      'products',
      'sales',
      'stock',
      'projects',
      'members',
      'documents',
      'reports',
      'hr',
    ];
    async function grant(module, permissions, role = ownerRole, organizationId = org) {
      await root.call('admin/business/grants', {
        module,
        organizationId,
        roleId: role.id,
        permissions,
      });
    }
    await t.test('installation, activation et absence de droits métier implicites', async () => {
      if (!(await root.call('status')).initialized)
        await root.call('setup', {
          setupToken,
          name: 'Operator',
          email: 'operator@example.org',
          password,
        });
      await root.call('login', { email: 'operator@example.org', password });
      const catalog = await root.call('business');
      assert.equal(catalog.definitions.length, 9);
      assert.equal(catalog.billingProviderAvailable, false);
      assert.equal(catalog.currency, 'EUR');
      await root.call('admin/users', {
        name: 'Business Browser Admin',
        email: 'business-admin@example.org',
        password,
        platformAdmin: true,
      });
      const ownerId = (
        await root.call('admin/users', {
          name: 'Business Owner',
          email: 'business-owner@example.org',
          password,
          platformAdmin: false,
        })
      ).id;
      const otherId = (
        await root.call('admin/users', {
          name: 'Other Business Owner',
          email: 'business-other@example.org',
          password,
          platformAdmin: false,
        })
      ).id;
      org = (
        await root.call('admin/organizations', {
          name: 'Phase 7 Alpha',
          kind: 'business',
          locale: 'fr',
          timezone: 'Europe/Paris',
          ownerId,
        })
      ).id;
      orgB = (
        await root.call('admin/organizations', {
          name: 'Phase 7 Beta',
          kind: 'association',
          locale: 'fr',
          timezone: 'Europe/Paris',
          ownerId: otherId,
        })
      ).id;
      await owner.call('login', { email: 'business-owner@example.org', password });
      await owner.call(`organizations/${org}/select`, {});
      await other.call('login', { email: 'business-other@example.org', password });
      await other.call(`organizations/${orgB}/select`, {});
      ownerRole = (await root.call(`admin/organizations/${org}/roles`)).find(
        (r) => r.builtin === 'admin',
      );
      const betaRole = (await root.call(`admin/organizations/${orgB}/roles`)).find(
        (r) => r.builtin === 'admin',
      );
      for (const module of defs) {
        await root.call(`admin/modules/orkobi.${module}`, { enabled: true });
        await owner.call(`modules/orkobi.${module}/activate`, {});
        await other.call(`modules/orkobi.${module}/activate`, {});
      }
      await owner.call('business/crm/contacts', undefined, 403);
      await owner.call(`modules/orkobi.crm/data/contacts`, { name: 'bypass' }, 404);
      for (const module of defs) {
        const perms =
          module === 'reports'
            ? ['orkobi.reports:read']
            : [
                `orkobi.${module}:read`,
                `orkobi.${module}:write`,
                ...(module === 'hr' ? ['orkobi.hr:approve'] : []),
              ];
        await grant(module, perms);
        await grant(module, perms, betaRole, orgB);
      }
      const all = (await owner.call('session')).organizations.find((o) => o.id === org).permissions;
      assert.ok(all.includes('orkobi.hr:approve'));
      assert.ok(all.includes('modules:write'));
      await root.call('business/crm/contacts', undefined, 400);
    });
    await t.test('CRM : isolation, schéma fermé et mises à jour concurrentes', async () => {
      contact = (await owner.save('crm/contacts', customer)).record;
      foreignContact = (await other.save('crm/contacts', { ...customer, name: 'Client Beta' }))
        .record;
      await owner.call(`business/crm/contacts/${foreignContact.id}`, undefined, 404);
      const bad = await owner.save('crm/contacts', { ...customer, organizationId: orgB }, {}, 400);
      assert.equal(bad.error.reason, 'invalid_fields');
      await owner.call(
        'business/crm/contacts',
        { values: customer, idempotencyKey: randomUUID(), organizationId: orgB },
        400,
      );
      const payload = {
        values: { ...customer, name: 'Nouveau nom' },
        expectedRevision: contact.revision,
        idempotencyKey: randomUUID(),
      };
      const updated = await owner.call(`business/crm/contacts/${contact.id}`, payload);
      assert.equal(updated.record.revision, 2);
      const stale = await owner.call(
        `business/crm/contacts/${contact.id}`,
        { ...payload, idempotencyKey: randomUUID() },
        409,
      );
      assert.equal(stale.error.reason, 'revision_conflict');
      contact = updated.record;
    });
    await t.test(
      'catalogue : unicité, décimaux exacts, idempotence et autorisation avant replay',
      async () => {
        const key = randomUUID(),
          body = { values: productValues, idempotencyKey: key };
        const a = await owner.call('business/products/products', body),
          b = await owner.call('business/products/products', body);
        assert.deepEqual(a, b);
        product = a.record;
        const listedProduct = (await owner.call('business/products/products')).records.find(
          (item) => item.id === product.id,
        );
        assert.equal(listedProduct.data.unit, 'unité');
        assert.equal(listedProduct.data.exemption, '');
        const conflict = await owner.call(
          'business/products/products',
          { ...body, values: { ...productValues, name: 'different' } },
          409,
        );
        assert.equal(conflict.error.reason, 'idempotency_conflict');
        await owner.save('products/products', { ...productValues, sku: 'bien-1' }, {}, 409);
        await owner.save(
          'products/products',
          { ...productValues, sku: 'bad', price: '1.001' },
          {},
          400,
        );
        await grant('products', []);
        await owner.call('business/products/products', body, 403);
        await grant('products', ['orkobi.products:read', 'orkobi.products:write']);
        await owner.save(
          'products/products',
          { ...productValues, sku: 'ZERO', vatRate: '0', exemption: '' },
          {},
          400,
        );
      },
    );
    await t.test('devis : références autorisées, identité obligatoire et arrondis', async () => {
      const lines = [{ productId: product.id, quantity: '3.000', price: '0.10' }];
      await owner.save(
        'sales/quotes',
        { customerId: foreignContact.id, validUntil: '2027-12-31' },
        { lines },
        404,
      );
      quote = (
        await owner.save(
          'sales/quotes',
          { customerId: contact.id, validUntil: '2027-12-31' },
          { lines },
        )
      ).record;
      assert.equal(quote.data.netMinor, '30');
      assert.equal(quote.data.vatMinor, '6');
      assert.equal(quote.data.totalMinor, '36');
      const noProfile = await owner.act(quote, 'prepare', {}, 409);
      assert.equal(noProfile.error.reason, 'profile_required');
      await owner.save('sales/profile', {
        name: 'Société Test',
        address: '20 rue du Test, 75001 Paris',
        siren: '123456789',
        vatNumber: 'FR00123456789',
        legalTerms: 'Conditions de test à valider juridiquement.',
      });
      quote = (await owner.act(quote, 'prepare')).record;
      assert.match(quote.reference, /^DEV-\d{4}-000001$/u);
      assert.equal(quote.data.customer.name, 'Nouveau nom');
      await owner.save(
        `crm/contacts/${contact.id}`,
        { ...customer, name: 'Client encore changé' },
        { expectedRevision: contact.revision },
      );
      assert.equal(
        (await owner.call(`business/sales/quotes/${quote.id}`)).record.data.customer.name,
        'Nouveau nom',
      );
      await owner.save(
        `sales/quotes/${quote.id}`,
        { customerId: contact.id, validUntil: '2027-12-31' },
        { expectedRevision: quote.revision, lines },
        409,
      );
    });
    await t.test('accord client, préparation unique et émission fiscale bloquée', async () => {
      await owner.act(quote, 'accept', { acceptanceReference: '' }, 400);
      quote = (await owner.act(quote, 'accept', { acceptanceReference: 'Accord écrit TEST-1' }))
        .record;
      invoice = (await owner.act(quote, 'convert')).record;
      assert.equal(invoice.data.fiscal, false);
      assert.equal(invoice.data.transmission, 'provider_required');
      assert.equal(invoice.state, 'prepared');
      await owner.act(quote, 'convert', {}, 409);
      const blocked = await owner.act(invoice, 'issue', {}, 409);
      assert.equal(blocked.error.reason, 'billing_provider_required');
      await owner.save(
        `sales/invoices/${invoice.id}`,
        { name: 'rewrite' },
        { expectedRevision: invoice.revision },
        400,
      );
      assert.equal((await owner.call('business/sales/invoices')).records.length, 1);
    });
    await t.test('stocks : soldes exacts, concurrence et compensation append-only', async () => {
      warehouse = (await owner.save('stock/warehouses', { code: 'PARIS', name: 'Paris' })).record;
      const vals = {
        productId: product.id,
        warehouseId: warehouse.id,
        direction: 'in',
        quantity: '2.000',
        reason: 'Réception',
      };
      const receipt = (await owner.save('stock/movements', vals)).record;
      const results = await Promise.all(
        [1, 2].map(async () => {
          const response = await fetch(`${base}/api/platform/business/stock/movements`, {
            method: 'POST',
            headers: {
              cookie: owner.cookie,
              origin: base,
              'content-type': 'application/json',
              'x-orkobi-request': '1',
              'x-csrf-token': owner.csrf,
            },
            body: JSON.stringify({
              values: { ...vals, direction: 'out', quantity: '1.500' },
              idempotencyKey: randomUUID(),
            }),
          });
          return { status: response.status, data: await response.json() };
        }),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      assert.equal(results.find((r) => r.status === 409).data.error.reason, 'insufficient_stock');
      assert.equal((await owner.call('business/stock/balances')).records[0].data.quantity, '0.500');
      await owner.act(product, 'archive', {}, 409);
      await owner.act(receipt, 'reverse', { reason: 'Trop tard, stock consommé' }, 409);
      const outgoing = results.find((r) => r.status === 200).data.record;
      const reversal = (await owner.act(outgoing, 'reverse', { reason: 'Retour' })).record;
      assert.equal(reversal.data.reversesId, outgoing.id);
      const latest = (await owner.call(`business/stock/movements/${outgoing.id}`)).record;
      assert.equal(latest.state, 'reversed');
      await owner.act(latest, 'reverse', { reason: 'Bis' }, 409);
      assert.equal((await owner.call('business/stock/balances')).records[0].data.quantity, '2.000');
      await owner.save(
        `stock/movements/${receipt.id}`,
        vals,
        { expectedRevision: receipt.revision },
        409,
      );
    });
    await t.test('projets : fermeture protégée tant que des tâches sont ouvertes', async () => {
      project = (
        await owner.save('projects/projects', {
          code: 'PROJET-1',
          name: 'Projet',
          startDate: '2026-01-01',
          endDate: '2027-12-31',
          budget: '100.00',
        })
      ).record;
      task = (
        await owner.save('projects/tasks', {
          projectId: project.id,
          title: 'Tâche',
          dueDate: '2027-01-01',
        })
      ).record;
      assert.equal(
        (await owner.act(project, 'complete', {}, 409)).error.reason,
        'project_has_open_tasks',
      );
      task = (await owner.act(task, 'start')).record;
      task = (await owner.act(task, 'complete')).record;
      project = (await owner.act(project, 'complete')).record;
      await owner.act(task, 'reopen', {}, 409);
      project = (await owner.act(project, 'reopen')).record;
      task = (await owner.act(task, 'reopen')).record;
      assert.equal(task.state, 'todo');
    });
    await t.test('associations : cotisation unique et paiement non réinscriptible', async () => {
      member = (
        await owner.save('members/members', {
          number: 'MEM-1',
          name: 'Membre',
          joinedOn: '2026-01-01',
        })
      ).record;
      const vals = {
        memberId: member.id,
        period: 'Année 2026',
        amount: '25.00',
        dueDate: '2026-12-31',
      };
      due = (await owner.save('members/dues', vals)).record;
      await owner.save('members/dues', vals, {}, 409);
      await owner.act(member, 'archive', {}, 409);
      due = (
        await owner.act(due, 'pay', {
          paidOn: '2026-01-01',
          method: 'transfer',
          paymentReference: 'TEST',
        })
      ).record;
      assert.equal(due.state, 'paid');
      await owner.act(due, 'pay', { paidOn: '2026-01-01', method: 'transfer' }, 409);
      await owner.save(`members/dues/${due.id}`, vals, { expectedRevision: due.revision }, 409);
      await owner.act(due, 'archive', {}, 409);
    });
    await t.test(
      'RH : validation séparée, contrat, chevauchements et données privées',
      async () => {
        employee = (
          await owner.save('hr/employees', {
            number: 'EMP-1',
            name: 'Salarié',
            contract: 'permanent',
            startDate: '2026-01-01',
          })
        ).record;
        await owner.save(
          'hr/employees',
          {
            number: 'EMP-2',
            name: 'Test',
            contract: 'permanent',
            startDate: '2026-01-01',
            nir: 'secret',
          },
          {},
          400,
        );
        const vals = {
          employeeId: employee.id,
          startDate: '2026-12-01',
          endDate: '2026-12-03',
          category: 'paid',
        };
        leave = (await owner.save('hr/leave', vals)).record;
        const second = (await owner.save('hr/leave', { ...vals, startDate: '2026-12-02' })).record;
        const approverId = (
          await root.call('admin/users', {
            name: 'Approver',
            email: 'business-approver@example.org',
            password,
            platformAdmin: false,
          })
        ).id;
        assert.ok(approverId);
        approverRole = await owner.call(`organizations/${org}/roles`, {
          name: 'Approbation RH',
          permissions: ['organization:read'],
        });
        // La création renvoie l'identifiant, la lecture reprend le contrat complet.
        approverRole = (await owner.call(`organizations/${org}/roles`)).find(
          (r) => r.name === 'Approbation RH',
        );
        await owner.call(`organizations/${org}/members`, {
          email: 'business-approver@example.org',
          roleId: approverRole.id,
          active: true,
        });
        await grant('hr', ['orkobi.hr:read', 'orkobi.hr:approve'], approverRole);
        await approver.call('login', { email: 'business-approver@example.org', password });
        await approver.call(`organizations/${org}/select`, {});
        await approver.save(
          'hr/employees',
          { number: 'DENY', name: 'No', contract: 'permanent', startDate: '2026-01-01' },
          {},
          403,
        );
        leave = (await approver.act(leave, 'approve')).record;
        await owner.act(leave, 'archive', {}, 409);
        await owner.save(
          `hr/employees/${employee.id}`,
          {
            number: 'EMP-1',
            name: 'Salarié',
            contract: 'permanent',
            startDate: '2026-01-01',
            endDate: '2026-11-01',
          },
          { expectedRevision: employee.revision },
          409,
        );
        assert.equal(leave.state, 'approved');
        await approver.act(second, 'approve', {}, 409);
        await owner.save('hr/leave', { ...vals, startDate: '2025-12-30' }, {}, 400);
      },
    );
    await t.test('documents : intégrité, limites et téléchargement scoped', async () => {
      const text = 'Document de test privé',
        contentBase64 = Buffer.from(text).toString('base64');
      file = (
        await owner.save(
          'documents/files',
          { name: 'Pièce test' },
          { file: { fileName: 'test.txt', mediaType: 'text/plain', contentBase64 } },
        )
      ).record;
      const downloaded = await owner.call(`business/documents/files/${file.id}/download`);
      assert.equal(Buffer.from(downloaded.contentBase64, 'base64').toString(), text);
      assert.equal(downloaded.sha256, createHash('sha256').update(text).digest('hex'));
      await other.call(`business/documents/files/${file.id}/download`, undefined, 404);
      await owner.save(
        'documents/files',
        { name: 'bad' },
        { file: { fileName: '../test', mediaType: 'text/plain', contentBase64 } },
        400,
      );
      await owner.save(
        'documents/files',
        { name: 'bad' },
        { file: { fileName: 'test.html', mediaType: 'text/html', contentBase64 } },
        400,
      );
      const large = await owner.save(
        'documents/files',
        { name: 'too big' },
        {
          file: {
            fileName: 'test.txt',
            mediaType: 'text/plain',
            contentBase64: Buffer.alloc(49153, 65).toString('base64'),
          },
        },
        400,
      );
      assert.equal(large.error.reason, 'file_too_large');
      await owner.save(
        'documents/files',
        { name: 'bad pdf' },
        { file: { fileName: 'test.pdf', mediaType: 'application/pdf', contentBase64 } },
        400,
      );
    });
    await t.test(
      'pagination HTTP et rapports SQL complets filtrés par droits actuels',
      async () => {
        // 101 fiches établissent que le rapport ne totalise pas seulement la page courante.
        for (let i = 0; i < 100; i++)
          await owner.save('crm/contacts', { ...customer, name: `Pagination ${i}` });
        const first = await owner.call('business/crm/contacts');
        assert.equal(first.records.length, 100);
        assert.ok(first.nextCursor);
        const second = await owner.call(`business/crm/contacts?cursor=${first.nextCursor}`);
        assert.equal(second.records.length, 1);
        assert.equal(second.nextCursor, null);
        assert.ok(!first.records.some((a) => second.records.some((b) => b.id === a.id)));
        const all = await owner.call('business/reports');
        assert.equal(all.modules.find((m) => m.key === 'crm').rows[0].count, 101);
        assert.ok(all.modules.some((m) => m.key === 'hr'));
        await grant('hr', []);
        const filtered = await owner.call('business/reports');
        assert.ok(!filtered.modules.some((m) => m.key === 'hr'));
        await owner.call('business/hr/employees', undefined, 403);
        await grant('hr', ['orkobi.hr:read', 'orkobi.hr:write', 'orkobi.hr:approve']);
      },
    );
    await t.test(
      'rollback atomique lorsque l’audit est indisponible, reprise idempotente intacte',
      async () => {
        const key = randomUUID(),
          body = { idempotencyKey: key, values: { ...productValues, sku: 'ROLLBACK' } };
        const revoke = sql.mysql
          ? `REVOKE INSERT ON \`${process.env.DB_NAME}\`.orkobi_core__audit_events FROM 'orkobi_app'@'%'`
          : 'REVOKE INSERT ON orkobi_core.audit_events FROM orkobi_app';
        const restore = sql.mysql
          ? `GRANT INSERT ON \`${process.env.DB_NAME}\`.orkobi_core__audit_events TO 'orkobi_app'@'%'`
          : 'GRANT INSERT ON orkobi_core.audit_events TO orkobi_app';
        await sql.query(revoke);
        try {
          await owner.call('business/products/products', body, 503);
        } finally {
          await sql.query(restore);
        }
        const rows = await sql.query(
          "SELECT count(*) AS count FROM orkobi_business.records WHERE organization_id=$1 AND reference_key='ROLLBACK'",
          [org],
        );
        assert.equal(Number(rows.rows[0].count), 0);
        const receipt = await sql.query(
          'SELECT count(*) AS count FROM orkobi_business.operations WHERE organization_id=$1 AND operation_key=$2',
          [org, key],
        );
        assert.equal(Number(receipt.rows[0].count), 0);
        assert.equal(
          (await owner.call('business/products/products', body)).record.reference,
          'ROLLBACK',
        );
      },
    );
    await t.test(
      'rapports : sommes exactes au-delà de Number.MAX_SAFE_INTEGER sur chaque moteur',
      async () => {
        const actor = (
          await sql.query('SELECT id FROM orkobi_core.users WHERE email=$1', [
            'business-owner@example.org',
          ])
        ).rows[0].id;
        const expected = 9007199254740993n;
        // Fixture SQL d'agrégation : 9008 montants individuellement bornés à 10^12 centimes.
        // Ces lignes ne constituent pas une recette des transitions métier.
        try {
          for (let offset = 0; offset < 9008; offset += 500) {
            const parameters = [],
              rows = [];
            for (let i = offset; i < Math.min(offset + 500, 9008); i++) {
              const amount = i === 9007 ? expected - 9007n * 1000000000000n : 1000000000000n;
              const n = parameters.length;
              parameters.push(
                randomUUID(),
                org,
                JSON.stringify({
                  amount: `${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`,
                }),
                String(amount),
                actor,
              );
              rows.push(
                `($${n + 1},$${n + 2},'orkobi.members','dues',$${n + 3},'aggregation_probe',$${n + 4},$${n + 5})`,
              );
            }
            await sql.query(
              'INSERT INTO orkobi_business.records(id,organization_id,module_id,entity,data,state,amount_minor,created_by) VALUES ' +
                rows.join(','),
              parameters,
            );
          }
          const report = await owner.call('business/reports');
          const row = report.modules
            .find((module) => module.key === 'members')
            .rows.find((row) => row.state === 'aggregation_probe');
          assert.equal(row.count, 9008);
          assert.equal(row.amountMinor, String(expected));
        } finally {
          await sql.query(
            "DELETE FROM orkobi_business.records WHERE organization_id=$1 AND state='aggregation_probe'",
            [org],
          );
        }
      },
    );
    await t.test(
      'désactivation immédiate, audit sans contenu métier, logs sans secrets',
      async () => {
        await owner.call('modules/orkobi.documents/deactivate', {});
        await owner.call(`business/documents/files/${file.id}/download`, undefined, 403);
        await owner.call('modules/orkobi.documents/activate', {});
        assert.equal(
          (await owner.call(`business/documents/files/${file.id}`)).record.data.sha256,
          file.data.sha256,
        );
        const audit = await sql.query(
          "SELECT event,target_id FROM orkobi_core.audit_events WHERE organization_id=$1 AND event LIKE 'business.%'",
          [org],
        );
        assert.ok(audit.rows.length > 100);
        assert.ok(
          audit.rows.every((row) => !JSON.stringify(row).includes('Document de test privé')),
        );
        assert.ok(!logs.join('').includes(password));
        assert.ok(!logs.join('').includes(setupToken));
        assert.ok(!logs.join('').includes(file.data.sha256));
      },
    );
  },
);
