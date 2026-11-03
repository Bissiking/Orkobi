const { structuredClone } = globalThis;
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { test } from 'node:test';
import { runPlugin } from '../apps/core/dist/plugins/sandbox.js';
import { isPluginArtifact } from '../lib/contracts/dist/index.js';
import { pluginDigest } from '../apps/core/dist/plugins/manager.js';
const manifest = JSON.parse(
  await readFile(new URL('../examples/plugin-demo/manifest.json', import.meta.url), 'utf8'),
);
const options = (code) => ({
  code,
  handler: 'run',
  handlers: ['run'],
  context: { userId: 'user', organizationId: 'org' },
  input: {},
  timeoutMs: 250,
});
test('plugins : manifeste, namespaces, compatibilité frontend et empreinte canonique', () => {
  const artifact = {
    manifest,
    code: 'export function add_card(){};export function count_cards(){};export function verify_cards(){};',
  };
  assert.equal(isPluginArtifact(artifact), true);
  assert.equal(
    pluginDigest(artifact),
    pluginDigest({ code: artifact.code, manifest: artifact.manifest }),
  );
  assert.notEqual(pluginDigest(artifact), pluginDigest({ ...artifact, code: artifact.code + ' ' }));
  for (const mutate of [
    (m) => {
      m.apiVersion = 2;
    },
    (m) => {
      m.module.id = 'orkobi.evil';
    },
    (m) => {
      m.module.permissions[0].key = 'organization:write';
    },
    (m) => {
      m.module.entities[0].table = 'orkobi_core.users';
    },
    (m) => {
      m.frontend.apiVersion = 99;
    },
    (m) => {
      m.frontend.pages[0].icon = { toString: null };
    },
    (m) => {
      m.migrations[0].version = 2;
    },
  ]) {
    const copy = structuredClone(artifact);
    mutate(copy.manifest);
    assert.equal(isPluginArtifact(copy), false);
  }
});
test('sandbox : RPC borné, valeurs JSON et moteur distinct du JavaScript hôte', async () => {
  const calls = [];
  const result = await runPlugin(
    options(
      'export function run(sdk){return {host:typeof process,net:typeof fetch,fs:typeof require,result:sdk.data.list("cards")};}',
    ),
    async (op, args) => {
      calls.push({ op, args });
      return { ok: true, value: { entries: [] } };
    },
  );
  assert.deepEqual(result, {
    host: 'undefined',
    net: 'undefined',
    fs: 'undefined',
    result: { ok: true, value: { entries: [] } },
  });
  assert.deepEqual(calls, [{ op: 'data.list', args: { entity: 'cards' } }]);
});
test('sandbox : import système, exception, fuite par constructeur et handlers manquants refusés', async () => {
  for (const code of [
    'import fs from "node:fs";export function run(){return fs.readFileSync("/etc/passwd");}',
    'export function run(){return Function("return process")().env;}',
    'export function run(){throw new Error("secret-sentinel");}',
    'export function other(){}',
    'export async function run(){return 1;}',
  ])
    await assert.rejects(
      runPlugin(options(code), async () => {}),
      (error) => !error.message.includes('secret-sentinel'),
    );
});
test('sandbox : boucle infinie, mémoire et quota RPC interrompus', { timeout: 10000 }, async () => {
  for (const code of [
    'export function run(){while(true){}}',
    'export function run(){const a=[];for(;;)a.push("x".repeat(100000));}',
    'export function run(sdk){for(let i=0;i<200;i++)sdk.data.list("cards");}',
  ])
    await assert.rejects(runPlugin(options(code), async () => ({ ok: true, value: [] })));
});

test(
  'sandbox : le timeout annule aussi une opération hôte encore en attente',
  { timeout: 5000 },
  async () => {
    let wrote = false;
    await assert.rejects(
      runPlugin(
        options('export function run(sdk){return sdk.data.create("cards",{title:"Deferred"});}'),
        async (_op, _args, signal) => {
          await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
          signal.throwIfAborted();
          wrote = true;
          return { ok: true, value: null };
        },
      ),
    );
    assert.equal(wrote, false);
  },
);
