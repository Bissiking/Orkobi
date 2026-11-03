import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { test } from 'node:test';
import { coreVersion } from '../apps/core/dist/version.js';
import { productVersion } from '../apps/bff/dist/config.js';
import { satisfiesRange, pluginApiVersion } from '../lib/contracts/dist/index.js';
import { demoManifest } from '../modules/demo/dist/index.js';
import { businessDefinitions } from '../modules/business/dist/index.js';
const product = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const example = JSON.parse(
  await readFile(new URL('../examples/plugin-demo/manifest.json', import.meta.url), 'utf8'),
);
test('versionnement : Core/OpenAPI et BFF emploient la version produit de la racine', () => {
  assert.equal(coreVersion, product.version);
  assert.equal(productVersion, product.version);
});
test('versionnement : la version courante reste acceptée par les modules officiels et le plugin API 1', () => {
  for (const manifest of [
    demoManifest,
    ...businessDefinitions.map((d) => d.manifest),
    example.module,
  ])
    assert.ok(
      satisfiesRange(coreVersion, manifest.core),
      `${manifest.id} incompatible avec ${coreVersion}`,
    );
  assert.ok(satisfiesRange(coreVersion, example.sdk));
  assert.equal(example.apiVersion, pluginApiVersion);
});
