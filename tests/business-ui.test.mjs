/* global AbortController */
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import { businessDefinition } from '../modules/business/dist/index.js';
const require = createRequire(import.meta.url),
  ts = require('typescript'),
  directory = await mkdtemp(join(tmpdir(), 'orkobi-ui-models-'));
after(() => rm(directory, { recursive: true, force: true }));
for (const [name, path] of [
  ['business-copy', 'apps/web/src/platform/business-copy.ts'],
  ['presentation', 'apps/web/src/platform/business/presentation.ts'],
  ['reference-store', 'apps/web/src/platform/business/reference-store.ts'],
  ['api', 'apps/web/src/platform/api.ts'],
]) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const output = ts
    .transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    })
    .outputText.replaceAll("'../business-copy'", "'./business-copy.mjs'")
    .replaceAll(
      "'@orkobi/contracts'",
      JSON.stringify(
        pathToFileURL(
          createRequire(new URL('../apps/web/package.json', import.meta.url)).resolve(
            '@orkobi/contracts',
          ),
        ).href,
      ),
    );
  await writeFile(join(directory, `${name}.mjs`), output);
}
const { ReferenceStore } = await import(pathToFileURL(join(directory, 'reference-store.mjs')));
const { filterRecords, displayValue, recordActions, canEditRecord } = await import(
  pathToFileURL(join(directory, 'presentation.mjs'))
);
const row = (id, data = {}, state = 'active') => ({
  id,
  module: 'crm',
  entity: 'contacts',
  data,
  state,
  reference: null,
  parentId: null,
  revision: 1,
  createdAt: '',
  updatedAt: '',
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
test('UX : cinquante sélecteurs de produits partagent une seule lecture en cours', async () => {
  let calls = 0;
  const request = deferred(),
    store = new ReferenceStore(() => {
      calls++;
      return request.promise;
    });
  const reads = Array.from({ length: 50 }, () => store.load('products'));
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(store.snapshot('products').loading, true);
  request.resolve({ records: [row('one')], nextCursor: null });
  await Promise.all(reads);
  assert.equal(store.snapshot('products').records.length, 1);
  await store.load('products');
  assert.equal(calls, 1);
});
test('UX : pagination des références, échec récupérable et absence de doublons', async () => {
  let calls = 0;
  const store = new ReferenceStore(async (path) => {
    calls++;
    if (calls === 1) return { records: [row('one')], nextCursor: 'two' };
    if (calls === 2) throw new Error('offline');
    assert.equal(path, 'products?cursor=two');
    return { records: [row('one'), row('two')], nextCursor: null };
  });
  await store.load('products');
  await store.load('products', true);
  assert.equal(store.snapshot('products').records.length, 1);
  assert.equal(store.snapshot('products').error, true);
  await store.load('products', true);
  assert.deepEqual(
    store.snapshot('products').records.map((row) => row.id),
    ['one', 'two'],
  );
  assert.equal(store.snapshot('products').error, false);
});
test('UX : une réponse ancienne ne réapparaît pas après invalidation du contexte', async () => {
  const old = deferred();
  let calls = 0;
  const store = new ReferenceStore(() =>
    ++calls === 1 ? old.promise : Promise.resolve({ records: [row('new')], nextCursor: null }),
  );
  const pending = store.load('contacts');
  await Promise.resolve();
  store.clear();
  await store.load('contacts');
  old.resolve({ records: [row('old')], nextCursor: null });
  await pending;
  assert.deepEqual(
    store.snapshot('contacts').records.map((row) => row.id),
    ['new'],
  );
});
test('UX : recherche sur les libellés visibles, les accents et les états de la page', () => {
  const entity = businessDefinition('crm').entities[0],
    records = [
      row('one', { name: 'Élodie', kind: 'company' }),
      row('two', { name: 'Élodie' }, 'archived'),
    ];
  assert.equal(filterRecords(records, 'elodie', '', false, entity, 'fr').length, 1);
  assert.equal(filterRecords(records, 'entreprise', '', false, entity, 'fr').length, 1);
  assert.equal(filterRecords(records, '', 'archived', true, entity, 'fr')[0].id, 'two');
  const product = businessDefinition('products').entities[0];
  assert.equal(
    displayValue(row('price', { price: '9007199254.99' }), product, 'price', 'fr').replaceAll(
      /\s/gu,
      '',
    ),
    '9007199254,99€',
  );
});
test('UX : les actions disponibles respectent le statut et l’approbation RH distincte', () => {
  const leave = { ...row('leave', {}, 'requested'), module: 'hr', entity: 'leave' };
  assert.deepEqual(
    recordActions(leave, false, true).map((a) => a.key),
    ['approve', 'reject'],
  );
  assert.deepEqual(recordActions({ ...leave, state: 'approved' }, false, true), []);
  assert.equal(canEditRecord({ ...leave, state: 'approved' }), false);
  const reversal = {
    ...row('move', { reversesId: 'old' }, 'posted'),
    module: 'stock',
    entity: 'movements',
  };
  assert.deepEqual(recordActions(reversal, true, false), []);
});

test('UX : une lecture abandonnée ne déconnecte pas une nouvelle session sur un ancien 401', async () => {
  const { platformRequest } = await import(pathToFileURL(join(directory, 'api.mjs')));
  const controller = new AbortController(),
    originalFetch = globalThis.fetch,
    originalWindow = globalThis.window;
  let logout = 0;
  globalThis.window = {
    dispatchEvent() {
      logout++;
    },
  };
  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    json: async () => {
      controller.abort();
      return { error: { code: 'unauthenticated' } };
    },
  });
  try {
    await assert.rejects(
      platformRequest('session', undefined, undefined, { signal: controller.signal }),
      (error) => error.name === 'AbortError',
    );
    assert.equal(logout, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('UX : les appels de confirmation restent asynchrones et les tables sont sémantiques', async () => {
  const { readdir } = await import('node:fs/promises');
  async function sources(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    return (
      await Promise.all(
        entries.map(async (entry) => {
          const path = join(directory, entry.name);
          return entry.isDirectory()
            ? sources(path)
            : /\.[jt]sx?$/u.test(path)
              ? [await readFile(path, 'utf8')]
              : [];
        }),
      )
    ).flat();
  }
  const source = [
    ...(await sources(new URL('../apps/web/src/', import.meta.url).pathname)),
    ...(await sources(new URL('../sdk/ui/src/', import.meta.url).pathname)),
  ].join('\n');
  assert.doesNotMatch(source, /window\.confirm\s*\(/u);
  assert.doesNotMatch(source, /role="table"/u);
  const headers = [...source.matchAll(/<th(?=[\s>])[^>]*>/gu)];
  assert.ok(headers.length > 0);
  assert.ok(headers.every(([header]) => header.includes('scope="col"')));
  const app = await readFile(new URL('../apps/web/src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /aria-current=\{\s*isModulesRoute/u);
});
