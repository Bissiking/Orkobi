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
if (!env.SETUP_TOKEN) {
  const value = randomBytes(32).toString('hex');
  content = /^SETUP_TOKEN=.*$/mu.test(content)
    ? content.replace(/^SETUP_TOKEN=.*$/mu, `SETUP_TOKEN=${value}`)
    : `${content}\nSETUP_TOKEN=${value}\n`;
  await writeFile(file, content, { mode: 0o600 });
}
process.stdout.write(
  'Jeton d’installation disponible dans .env (SETUP_TOKEN). Aucun secret existant remplacé.\n',
);
