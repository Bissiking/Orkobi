import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { URL } from 'node:url';
import process from 'node:process';
const root = new URL('../', import.meta.url);
const load = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const product = await load('package.json');
const version = product.version,
  channel = product.orkobi?.channel;
assert.match(
  version,
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:dev|beta|rc)\.[1-9]\d*)?$/u,
  'Version produit attendue : X.Y.Z[-dev.N|-beta.N|-rc.N].',
);
assert.equal(
  channel,
  version.includes('-dev.') ? 'dev' : /-[a-z]+\./u.test(version) ? 'beta' : 'stable',
  'Canal produit incohérent.',
);
const paths = ['package.json', 'tests/types/package.json'];
for (const directory of ['apps', 'lib', 'sdk', 'modules', 'examples']) {
  const entries = await readdir(new URL(`${directory}/`, root), { withFileTypes: true });
  for (const entry of entries.filter((entry) => entry.isDirectory())) {
    const path = `${directory}/${entry.name}/package.json`;
    try {
      await readFile(new URL(path, root));
      paths.push(path);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}
for (const path of paths) {
  const manifest = await load(path);
  assert.equal(manifest.private, true, `${path} : publication automatique interdite.`);
  assert.equal(manifest.version, version, `${path} : version différente de la racine.`);
}
for (const [path, image] of [
  ['compose.yaml', 'orkobi-local'],
  ['compose.mysql.yaml', 'orkobi-local'],
  ['compose.sql-test.yaml', 'orkobi-sql-test'],
  ['compose.store.yaml', 'orkobi-store-local'],
]) {
  const source = await readFile(new URL(path, root), 'utf8');
  assert.ok(
    source.includes(`image: ${image}:${version}`),
    `${path} : étiquette d'image locale désynchronisée.`,
  );
}
const readme = await readFile(new URL('README.md', root), 'utf8');
assert.ok(readme.includes(`# Orkobi — ${version}`), 'README : version produit désynchronisée.');
process.stdout.write(
  `${paths.length} manifests privés et 4 étiquettes Docker alignés sur ${version} (canal ${channel}).\n`,
);
