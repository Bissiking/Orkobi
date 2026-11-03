import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';

const args = process.argv.slice(2);
if (args.some((arg) => !/^--engine=(postgresql|mariadb|mysql)$/u.test(arg)) || args.length > 1) {
  process.stderr.write('Usage : pnpm infra:init [--engine=postgresql|mariadb|mysql]\n');
  process.exit(1);
}
const engine = args[0]?.slice('--engine='.length) ?? 'postgresql';
const name = engine === 'postgresql' ? '.env' : `.env.${engine}`;
let template = await readFile(
  new URL(
    engine === 'postgresql' ? '../.env.example' : '../infra/mysql/.env.example',
    import.meta.url,
  ),
  'utf8',
);
if (engine === 'mysql')
  template = template
    .replace('DB_ENGINE=mariadb', 'DB_ENGINE=mysql')
    .replace('SQL_IMAGE=mariadb:11.4', 'SQL_IMAGE=mysql:8.4');
const configured = template.replace(
  /^(POSTGRES_PASSWORD|SQL_ROOT_PASSWORD|MIGRATION_DB_PASSWORD|DB_PASSWORD|SETUP_TOKEN|INTERNAL_TOKEN)=$/gmu,
  (line) => `${line}${randomBytes(32).toString('hex')}`,
);
try {
  await writeFile(new URL(`../${name}`, import.meta.url), configured, { flag: 'wx', mode: 0o600 });
  process.stdout.write(`${name} créé avec les secrets locaux et le jeton d’installation.\n`);
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  process.stderr.write(`${name} existe déjà ; aucun secret remplacé.\n`);
  process.exitCode = 1;
}
