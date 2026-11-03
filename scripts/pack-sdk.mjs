import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import process from 'node:process';
const output = resolve('output/sdk');
await mkdir(output, { recursive: true });
const packages = [];
for (const directory of ['lib/contracts', 'sdk/types', 'sdk/core', 'sdk/ui']) {
  const manifest = JSON.parse(await readFile(`${directory}/package.json`, 'utf8'));
  const file = `${manifest.name.replace('@', '').replace('/', '-')}-${manifest.version}.tgz`;
  await new Promise((accept, reject) => {
    const child = spawn(
      'pnpm',
      ['--dir', directory, 'pack', '--out', resolve(output, file), '--yes'],
      { stdio: 'inherit' },
    );
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? accept() : reject(new Error('Packaging SDK échoué.')),
    );
  });
  const sha256 = createHash('sha256')
    .update(await readFile(resolve(output, file)))
    .digest('hex');
  packages.push({ name: manifest.name, version: manifest.version, file, sha256 });
}
await writeFile(
  resolve(output, 'manifest.json'),
  JSON.stringify({ packages, publishedToRegistry: false }, null, 2) + '\n',
);
await writeFile(
  resolve(output, 'pnpm-workspace.example.yaml'),
  JSON.stringify(
    {
      packages: ['.'],
      overrides: Object.fromEntries(packages.map((p) => [p.name, `file:./${p.file}`])),
    },
    null,
    2,
  ) + '\n',
);
process.stdout.write('SDK empaqueté localement, sans publication distante.\n');
