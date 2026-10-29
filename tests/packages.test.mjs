// tests/packages.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { pathToFileURL, URL } from 'node:url';

const directories = [
  'lib/contracts',
  'lib/database',
  'lib/security',
  'lib/identity',
  'lib/events',
  'sdk/core',
  'sdk/types',
];

for (const directory of directories) {
  test(`${directory} : export ESM, déclarations et dépendances internes résolus`, async () => {
    const packageUrl = new URL(`../${directory}/package.json`, import.meta.url);
    const pkg = JSON.parse(await readFile(packageUrl, 'utf8'));
    const require = createRequire(packageUrl);
    assert.equal(pkg.private, true);
    assert.equal(pkg.type, 'module');
    const module = await import(pathToFileURL(require.resolve(pkg.name)).href);
    assert.equal(typeof module, 'object');
    assert.equal(typeof require(pkg.name), 'object');
    await readFile(new URL(pkg.exports['.'].types, packageUrl));
    for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
      if (name.startsWith('@orkobi/')) assert.equal(version, 'workspace:*');
      assert.ok(require.resolve(name));
    }
    assert.throws(() => require.resolve(`${pkg.name}/src/index.ts`), {
      code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    });
  });
}

const requireContracts = createRequire(new URL('../lib/contracts/package.json', import.meta.url));
const { createId } = await import(
  pathToFileURL(requireContracts.resolve('@orkobi/contracts')).href
);

test('identifiants : préserve les valeurs et rejette les valeurs vides ou mal délimitées', () => {
  assert.equal(createId('org-unique-a'), 'org-unique-a');
  for (const value of ['', ' ', ' org-a', 'org-a\n']) {
    assert.throws(() => createId(value), TypeError);
  }
});
