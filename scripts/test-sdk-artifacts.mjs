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
    'react-dom@19.3.1',
    '@types/react-dom@19.3.0',
    'react-router@8.5.1',
    '@types/react@19.3.0',
  ]);
  await writeFile(
    resolve(directory, 'plugin.ts'),
    await readFile('examples/plugin-demo/plugin.ts', 'utf8'),
  );
  await writeFile(
    resolve(directory, 'business.ts'),
    `
import type { BusinessPort, PluginSdk } from '@orkobi/sdk-core';
import type { BusinessRecord } from '@orkobi/sdk-types';
export function readContact(port: BusinessPort): Promise<BusinessRecord> {
  return port.get('crm', 'contacts', '11111111-1111-4111-8111-111111111111');
}
export function guest(sdk: PluginSdk) {
  // @ts-expect-error Le guest API 1 ne reçoit pas de port hôte métier.
  void sdk.business;
}
`,
  );
  await writeFile(
    resolve(directory, 'ui.ts'),
    `
import { DataTable, Select, CheckField, TextArea, ConfirmDialog } from '@orkobi/sdk-ui';
import type { ConfirmDialogProps } from '@orkobi/sdk-ui';
export const table: Parameters<typeof DataTable>[0] = { label: 'Records', children: null };
export const select: Parameters<typeof Select>[0] = { label: 'Module', name: 'module', defaultValue: 'crm' };
export const check: Parameters<typeof CheckField>[0] = { label: 'Archived', checked: false, onChange() {} };
export const notes: Parameters<typeof TextArea>[0] = { label: 'Notes', name: 'notes', maxLength: 160 };
export const dialog: ConfirmDialogProps = { open: false, title: 'Confirm', message: 'Continue?', confirmLabel: 'Continue', cancelLabel: 'Cancel', onConfirm() {}, onCancel() {} };
void ConfirmDialog;
`,
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
      include: ['plugin.ts', 'business.ts', 'ui.ts'],
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
    "const ui=await import('@orkobi/sdk-ui'); for(const name of ['Button','AppIcon','DataTable','Th','EmptyState','StatusPill','SearchField','Tabs','Select','CheckField','TextArea','ConfirmDialog']) if(typeof ui[name]!=='function') throw new Error('Missing UI export: '+name); await import('@orkobi/sdk-core');",
  ]);
  process.stdout.write('Archives SDK consommées hors workspace : imports et typage réussis.\n');
} finally {
  await rm(directory, { recursive: true, force: true });
}
