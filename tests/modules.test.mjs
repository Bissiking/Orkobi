import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isModuleManifest } from '../lib/contracts/dist/index.js';
import {
  ModuleDataError,
  validateModuleStatement,
  migrationsForModule,
} from '../lib/database/dist/index.js';
import { demoManifest, demoModuleId } from '../modules/demo/dist/index.js';
import { parseVersion, satisfiesRange } from '../apps/core/dist/modules/range.js';
import { coreVersion } from '../apps/core/dist/version.js';
import { ModuleManager } from '../apps/core/dist/modules/manager.js';

test('versions : parse et plages SemVer minimales utilisées par les manifestes', () => {
  assert.deepEqual(parseVersion('1.2.3-alpha.1'), {
    major: 1,
    minor: 2,
    patch: 3,
    prerelease: 'alpha.1',
  });
  assert.equal(parseVersion('secret-test'), undefined);
  assert.equal(parseVersion('1.2'), undefined);
  assert.ok(satisfiesRange('0.2.0-EXP', '>=0.2.0-EXP <0.3.0'));
  assert.ok(satisfiesRange('0.2.5', '>=0.2.0 <0.3.0'));
  assert.ok(!satisfiesRange('0.3.0', '>=0.2.0 <0.3.0'));
  assert.ok(!satisfiesRange('0.1.9', '>=0.2.0 <0.3.0'));
  assert.ok(satisfiesRange('1.0.0', '=1.0.0'));
  assert.ok(!satisfiesRange('1.0.1', '=1.0.0'));
  // 1.2.3-alpha < 1.2.3 : une préversion n'inclut pas la version finale.
  assert.ok(!satisfiesRange('0.2.0-EXP', '>=0.2.0'));
  assert.ok(satisfiesRange('0.2.0', '>=0.2.0'));
  assert.ok(!satisfiesRange('secret-test', '>=0.2.0'));
  assert.ok(!satisfiesRange('0.2.0', 'secret-test'));
  assert.ok(satisfiesRange('1.0.0-beta.11', '>1.0.0-beta.2'));
  assert.ok(satisfiesRange('1.0.0-alpha.1', '<1.0.0-alpha.beta'));
  assert.ok(satisfiesRange('1.0.0-alpha.1', '>1.0.0-alpha'));
  for (const invalid of ['01.2.3', '1.2.3-01', '1.2.3-alpha..1', '1.2.3-.'])
    assert.equal(parseVersion(invalid), undefined);
});

test('activation : une capability facultative absente ne bloque pas et la readiness est lue une fois', async () => {
  let probes = 0;
  const { CapabilityRegistry } = await import('../apps/core/dist/modules/capability-registry.js');
  const capabilities = new CapabilityRegistry({
    async isReady() {
      probes++;
      return true;
    },
  });
  const manifest = {
    ...demoManifest,
    capabilities: [...demoManifest.capabilities, { key: 'core.events', required: false }],
  };
  let activated = false;
  const repo = {
    registerModule: async () => {},
    module: async () => ({ ...manifest, manifest, enabled: true }),
    organizationModules: async () => [],
    setOrganizationModule: async () => {
      activated = true;
    },
    audit: async () => {},
  };
  const manager = new ModuleManager({}, capabilities);
  await manager.setOrganizationActive(repo, 'user', 'organization', manifest.id, true);
  assert.equal(activated, true);
  assert.equal(probes, 1);
  manifest.capabilities = [{ key: 'core.events', required: true }];
  await assert.rejects(
    manager.setOrganizationActive(repo, 'user', 'organization', manifest.id, true),
  );
});

test('manifeste démo : identité, compatibilité et migrations propres', () => {
  assert.ok(isModuleManifest(demoManifest));
  assert.equal(demoManifest.id, demoModuleId);
  assert.equal(demoManifest.id, 'orkobi.demo');
  assert.ok(satisfiesRange(coreVersion, demoManifest.core));
  const owned = migrationsForModule(demoModuleId);
  assert.deepEqual(
    owned.map((migration) => migration.id),
    ['0004_module_demo'],
  );
  assert.ok(owned[0].sql.includes('orkobi_demo.notes'));
});

test('manifeste : schémas système, champs réservés et déclarations incohérentes refusés', () => {
  for (const patch of [
    { core: 'pas-une-plage' },
    { version: '1.0.0-01' },
    { dependencies: [demoModuleId] },
    { capabilities: [...demoManifest.capabilities, demoManifest.capabilities[0]] },
    { permissions: [...demoManifest.permissions, demoManifest.permissions[0]] },
    { permissions: [] },
    ...['orkobi_core.users', 'orkobi_infrastructure.schema_migrations'].map((table) => ({
      entities: [{ ...demoManifest.entities[0], table }],
    })),
    ...['id', 'organization_id', 'created_by', 'created_at', 'updated_at'].map((name) => ({
      entities: [{ ...demoManifest.entities[0], fields: [{ name, type: 'text', required: true }] }],
    })),
  ])
    assert.equal(isModuleManifest({ ...demoManifest, ...patch }), false, JSON.stringify(patch));
});

test('SQL de module : la valeur liée doit correspondre au contexte, y compris en insertion', () => {
  const owner = { moduleId: 'orkobi.demo', tables: ['orkobi_demo.notes'] };
  for (const text of [
    'SELECT id FROM orkobi_demo.notes WHERE organization_id=$1',
    'INSERT INTO orkobi_demo.notes (organization_id, title) VALUES ($1, $2) RETURNING id',
    'UPDATE orkobi_demo.notes SET title=$2 WHERE organization_id=$1',
    'DELETE FROM orkobi_demo.notes WHERE organization_id=$1',
  ]) {
    validateModuleStatement(owner, { text, parameters: ['org-a', 'title'] }, 'org-a');
    assert.throws(
      () => validateModuleStatement(owner, { text, parameters: ['org-b', 'title'] }, 'org-a'),
      ModuleDataError,
    );
  }
});

test('validateModuleStatement : instruction unique, tables détenues et organisation explicite', () => {
  const owner = { moduleId: 'orkobi.demo', tables: ['orkobi_demo.notes'] };
  // Valide : cible une table détenue avec organization_id.
  validateModuleStatement(owner, {
    text: 'SELECT id FROM orkobi_demo.notes WHERE organization_id = $1',
    parameters: ['org-a'],
  });
  // Semicolon final toléré (aucune instruction supplémentaire).
  validateModuleStatement(owner, {
    text: 'DELETE FROM orkobi_demo.notes WHERE id=$1 AND organization_id=$2;',
    parameters: ['entry', 'org-a'],
  });
  for (const statement of [
    { text: '', parameters: [] },
    { text: '   ', parameters: [] },
    // Deux instructions.
    {
      text: 'SELECT id FROM orkobi_demo.notes WHERE organization_id=$1; DROP TABLE orkobi_demo.notes',
      parameters: ['org-a'],
    },
    // Table non détenue.
    { text: 'SELECT id FROM public.users', parameters: [] },
    { text: 'SELECT id FROM orkobi_core.sessions WHERE organization_id=$1', parameters: ['org-a'] },
    // Aucune table détenue référencée.
    { text: 'SELECT 1', parameters: [] },
    // Schéma orkobi_ non détenu.
    { text: 'SELECT id FROM orkobi_core.organizations', parameters: [] },
    // Organization_id absent.
    { text: 'SELECT id FROM orkobi_demo.notes', parameters: [] },
    // Index de paramètre hors bornes.
    { text: 'SELECT id FROM orkobi_demo.notes WHERE organization_id=$2', parameters: ['org-a'] },
    { text: 'SELECT $0 FROM orkobi_demo.notes WHERE organization_id=$1', parameters: ['org-a'] },
    { text: 'SELECT organization_id FROM orkobi_demo.notes', parameters: [] },
    {
      text: 'DELETE FROM orkobi_demo.notes WHERE organization_id=$1 OR true',
      parameters: ['org-a'],
    },
    { text: 'SELECT id FROM orkobi_demo.notes /* organization_id */', parameters: [] },
    {
      text: 'SELECT id FROM orkobi_demo.notes WHERE organization_id=$1 UNION SELECT id FROM public.users',
      parameters: ['org-a'],
    },
    {
      text: 'SELECT id FROM orkobi_demo.notes, "orkobi_core"."users" WHERE organization_id=$1',
      parameters: ['org-a'],
    },
    {
      text: 'UPDATE orkobi_demo.notes SET organization_id=$1 WHERE organization_id=$2',
      parameters: ['org-b', 'org-a'],
    },
  ])
    assert.throws(
      () => validateModuleStatement(owner, statement),
      (error) => {
        assert.ok(error instanceof ModuleDataError);
        assert.equal(error.message, 'Opération de données refusée.');
        return true;
      },
    );
});

test('validateModuleStatement : aucune fuite du détail SQL dans le message public', () => {
  const owner = { moduleId: 'orkobi.demo', tables: ['orkobi_demo.notes'] };
  try {
    validateModuleStatement(owner, {
      text: 'DELETE FROM orkobi_core.sessions',
      parameters: [],
    });
    assert.fail('devait refuser');
  } catch (error) {
    assert.ok(!error.message.includes('orkobi_core'));
    assert.ok(!error.message.includes('DELETE'));
  }
});
