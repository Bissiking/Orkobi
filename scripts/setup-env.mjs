import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';

const template = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
const configured = template.replace(
  /^(POSTGRES_PASSWORD|MIGRATION_DB_PASSWORD|DB_PASSWORD|SETUP_TOKEN)=$/gmu,
  (line) => `${line}${randomBytes(32).toString('hex')}`,
);
try {
  await writeFile(new URL('../.env', import.meta.url), configured, { flag: 'wx', mode: 0o600 });
  process.stdout.write('.env créé avec les secrets locaux et le jeton d’installation.\n');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  process.stderr.write(
    '.env existe déjà ; le conserver et ajouter les variables de .env.example manquantes.\n',
  );
  process.exitCode = 1;
}
