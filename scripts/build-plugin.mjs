import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import process from 'node:process';
import { isPluginArtifact } from '../lib/contracts/dist/index.js';
const require = createRequire(import.meta.url),
  ts = require('typescript');
const directory = resolve(process.argv[2] ?? 'examples/plugin-demo');
const output = resolve(process.argv[3] ?? 'output/plugins/community.cards.json');
const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
const source = await readFile(resolve(directory, 'plugin.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    verbatimModuleSyntax: true,
  },
  reportDiagnostics: true,
});
if (compiled.diagnostics?.some((d) => d.category === ts.DiagnosticCategory.Error))
  throw new Error('Compilation refusée.');
const artifact = { manifest, code: compiled.outputText };
if (!isPluginArtifact(artifact)) throw new Error('Manifeste du plugin invalide.');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(artifact, null, 2) + '\n');
process.stdout.write(`Plugin construit : ${output}\n`);
