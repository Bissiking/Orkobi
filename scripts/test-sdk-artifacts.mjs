import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import process from 'node:process';
const require = createRequire(import.meta.url),
  directory = await mkdtemp(resolve(tmpdir(), 'orkobi-sdk-consumer-'));
const execute = (cmd, args) =>
  new Promise((accept, reject) => {
    const child = spawn(cmd, args, { cwd: directory, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? accept() : reject(new Error('Consommation du SDK empaqueté échouée.')),
    );
  });
try {
  const packages = JSON.parse(await readFile('output/sdk/manifest.json', 'utf8')).packages;
  const packageManager = JSON.parse(await readFile('package.json', 'utf8')).packageManager;
  await writeFile(
    resolve(directory, 'package.json'),
    JSON.stringify({
      name: 'orkobi-sdk-consumer-check',
      private: true,
      type: 'module',
      packageManager,
    }),
  );
  await writeFile(
    resolve(directory, 'pnpm-workspace.yaml'),
    JSON.stringify({
      packages: ['.'],
      overrides: Object.fromEntries(
        packages.map((p) => [p.name, `file:${resolve('output/sdk', p.file)}`]),
      ),
    }),
  );
  await execute('pnpm', [
    'add',
    ...packages.map((p) => resolve('output/sdk', p.file)),
    'react@19.3.1',
    'react-router@8.5.1',
  ]);
  await writeFile(
    resolve(directory, 'plugin.ts'),
    await readFile('examples/plugin-demo/plugin.ts', 'utf8'),
  );
  await writeFile(
    resolve(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        types: [],
      },
      include: ['plugin.ts'],
    }),
  );
  await execute(process.execPath, [
    require.resolve('typescript/bin/tsc'),
    '-p',
    resolve(directory, 'tsconfig.json'),
  ]);
  await execute(process.execPath, [
    '--input-type=module',
    '-e',
    "const {Button,AppIcon}=await import('@orkobi/sdk-ui'); if(typeof Button!=='function'||typeof AppIcon!=='function')process.exit(1); await import('@orkobi/sdk-core');",
  ]);
  process.stdout.write('Archives SDK consommées hors workspace : imports et typage réussis.\n');
} finally {
  await rm(directory, { recursive: true, force: true });
}
