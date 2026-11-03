import { satisfiesRange } from '../apps/core/dist/modules/range.js';
import { coreVersion } from '../apps/core/dist/version.js';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { isPluginArtifact } from '../lib/contracts/dist/index.js';
import { pluginDigest } from '../apps/core/dist/plugins/manager.js';
import { runPlugin } from '../apps/core/dist/plugins/sandbox.js';
const path = process.argv[2];
if (!path) throw new Error('Usage : pnpm plugin:validate <artifact.json>');
const artifact = JSON.parse(await readFile(path, 'utf8'));
if (
  !isPluginArtifact(artifact) ||
  !satisfiesRange(coreVersion, artifact.manifest.sdk) ||
  !satisfiesRange(coreVersion, artifact.manifest.module.core)
)
  throw new Error('Plugin invalide ou incompatible.');
await runPlugin(
  {
    code: artifact.code,
    handler: null,
    handlers: [
      ...artifact.manifest.actions.map((a) => a.key),
      ...(artifact.manifest.module.tasks ?? []).map((t) => t.key),
    ],
    context: {},
    input: {},
    timeoutMs: 500,
  },
  async () => ({ ok: false, error: { code: 'forbidden', message: 'Accès refusé.' } }),
);
process.stdout.write(
  JSON.stringify(
    {
      valid: true,
      id: artifact.manifest.module.id,
      version: artifact.manifest.module.version,
      digest: pluginDigest(artifact),
    },
    null,
    2,
  ) + '\n',
);
