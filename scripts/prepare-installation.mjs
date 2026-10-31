import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { URL } from 'node:url';
import process from 'node:process';

const file = new URL('../.env', import.meta.url);
let content;
try {
  content = await readFile(file, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  process.stderr.write('Créer d’abord .env avec pnpm infra:init.\n');
  process.exit(1);
}
const env = parseEnv(content);
let changed = false;
for (const key of ['SETUP_TOKEN', 'INTERNAL_TOKEN']) {
  if (env[key]) continue;
  const value = randomBytes(32).toString('hex');
  const pattern = new RegExp(`^${key}=.*$`, 'mu');
  content = pattern.test(content)
    ? content.replace(pattern, `${key}=${value}`)
    : `${content}\n${key}=${value}\n`;
  changed = true;
}
if (changed) {
  await writeFile(file, content, { mode: 0o600 });
}
process.stdout.write(
  'Jetons d’installation et BFF ↔ Core disponibles dans .env. Aucun secret existant remplacé.\n',
);
