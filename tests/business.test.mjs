import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  businessDefinitions,
  businessDefinition,
  BusinessError,
  actBusiness,
  decimalMinor,
  decimalText,
  validDate,
  validateValues,
  quoteLine,
  quoteTotals,
} from '../modules/business/dist/index.js';
import {
  isModuleManifest,
  publicBusinessDetails,
  organizationPermissions,
} from '../lib/contracts/dist/index.js';
const bad = (fn) => assert.throws(fn, BusinessError);
test('Phase 7 : neuf manifestes sans CRUD générique et permissions explicites', () => {
  assert.equal(businessDefinitions.length, 9);
  for (const d of businessDefinitions) {
    assert.equal(isModuleManifest(d.manifest), true);
    assert.deepEqual(d.manifest.entities, []);
    for (const permission of d.manifest.permissions)
      assert.ok(
        !organizationPermissions.includes(permission.key),
        'Aucune collision avec les droits Core',
      );
    assert.ok(d.manifest.permissions.some((p) => p.key === `orkobi.${d.key}:read`));
  }
  assert.equal(businessDefinition('unknown'), undefined);
});
test('Phase 7 : décimaux exacts, montants bornés et dates civiles', () => {
  assert.equal(decimalMinor('0.10') + decimalMinor('0,20'), 30n);
  assert.equal(decimalText(decimalMinor('1,005', 3), 3), '1.005');
  for (const v of ['-1', '1e3', 'NaN', 'Infinity', '01', '1.001', '1000000000000', 1.2, null])
    bad(() => decimalMinor(v));
  assert.equal(validDate('2028-02-29'), true);
  for (const v of ['2027-02-29', '2026-02-31', '2026-1-01', '2026-01-01T00:00:00Z'])
    assert.equal(validDate(v), false);
});
test('Phase 7 : TVA arrondie par ligne et limite cumulée', () => {
  const line = quoteLine({
    productId: 'x',
    name: 'Test',
    unit: 'u',
    quantity: '1.005',
    price: '0.10',
    vatRate: '20',
    exemption: '',
  });
  assert.equal(line.netMinor, '10');
  assert.equal(line.vatMinor, '2');
  assert.equal(quoteTotals([line, line, line]).totalMinor, '36');
  const half = quoteLine({ ...line, quantity: '0.500', price: '0.01' });
  assert.equal(half.netMinor, '1');
  bad(() => quoteLine({ ...line, quantity: '0' }));
  bad(() => quoteLine({ ...line, vatRate: '0', exemption: '' }));
  bad(() => quoteLine({ ...line, vatRate: '3' }));
  bad(() => quoteTotals(Array(51).fill(line)));
  const max = quoteLine({
    ...line,
    quantity: '1',
    price: '10000000000',
    vatRate: '0',
    exemption: 'Régime',
  });
  bad(() => quoteTotals([max, max]));
});
test('Phase 7 : schémas fermés et minimisation RH', () => {
  const employee = businessDefinition('hr').entities.find((e) => e.key === 'employees');
  const values = { number: 'EMP-1', name: 'Test', contract: 'permanent', startDate: '2026-01-01' };
  assert.equal(validateValues(employee, values).number, 'EMP-1');
  for (const field of ['organizationId', 'salary', 'nir', 'medical', 'permissions'])
    bad(() => validateValues(employee, { ...values, [field]: 'secret' }));
  bad(() => validateValues(employee, { ...values, endDate: '2025-12-31' }));
});

test('Phase 7 : métadonnées publiques fermées sans texte interne', () => {
  assert.deepEqual(
    publicBusinessDetails({
      businessReason: 'invalid_value',
      field: 'email',
      message: 'secret SQL',
      detail: 'private',
    }),
    { reason: 'invalid_value', field: 'email' },
  );
  assert.equal(publicBusinessDetails({ reason: 'private SQL', field: 'email' }), null);
  assert.deepEqual(publicBusinessDetails({ reason: 'revision_conflict', field: 'private data' }), {
    reason: 'revision_conflict',
  });
});

test('Phase 7 : compensation refusée sur une référence archivée ou désormais inaccessible', async () => {
  const movement = {
    id: 'movement',
    entity: 'movements',
    module: 'stock',
    state: 'posted',
    revision: 1,
    data: { productId: 'product', warehouseId: 'warehouse', direction: 'out', quantity: '1.000' },
  };
  for (const archived of ['products', 'warehouses']) {
    const port = {
      async get(_module, entity) {
        return entity === 'movements'
          ? movement
          : {
              id: entity,
              state: entity === archived ? 'archived' : 'active',
              data: { kind: 'goods' },
            };
      },
      async put() {
        assert.fail('Aucune écriture sur un stock archivé');
      },
    };
    await assert.rejects(
      actBusiness(port, 'stock', 'movements', 'movement', 'reverse', {
        expectedRevision: 1,
        reason: 'Retour',
      }),
      (error) => error instanceof BusinessError && error.reason === 'invalid_reference',
    );
  }
  const denied = new Error('access denied'),
    port = {
      async get(module) {
        if (module === 'products') throw denied;
        return movement;
      },
    };
  await assert.rejects(
    actBusiness(port, 'stock', 'movements', 'movement', 'reverse', {
      expectedRevision: 1,
      reason: 'Retour',
    }),
    (error) => error === denied,
  );
});
