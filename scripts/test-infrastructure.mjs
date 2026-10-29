import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';

const { fetch, AbortSignal } = globalThis;

const root = fileURLToPath(new URL('../', import.meta.url));
const id = randomBytes(6).toString('hex');
const directory = new URL(`../output/infrastructure/${id}/`, import.meta.url);
await mkdir(directory, { recursive: true });
const envFile = new URL('.env', directory);
await writeFile(
  envFile,
  [
    `DB_NAME=orkobi_verify_${id}`,
    'BFF_PUBLISHED_PORT=0',
    ...['POSTGRES_PASSWORD', 'MIGRATION_DB_PASSWORD', 'DB_PASSWORD'].map(
      (key) => `${key}=${randomBytes(32).toString('hex')}`,
    ),
  ].join('\n'),
  { mode: 0o600 },
);
const base = [
  'compose',
  '--project-name',
  `orkobi-verify-${id}`,
  '--env-file',
  fileURLToPath(envFile),
  '-f',
  'compose.yaml',
];

function compose(args, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', [...base, ...args], {
      cwd: root,
      stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    });
    let output = '';
    child.stdout?.on('data', (chunk) => {
      output += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0
        ? resolve(output.trim())
        : reject(new Error(`docker compose ${args[0]} : échec (${code}).`)),
    );
  });
}

async function probe(url, path, status) {
  const response = await fetch(`${url}${path}`, { signal: AbortSignal.timeout(8000) });
  assert.equal(response.status, status, path);
  return response;
}

async function waitReady(url) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${url}/api/ready`, { signal: AbortSignal.timeout(8000) })).ok) return;
    } catch {
      /* Le service peut être en redémarrage. */
    }
    await delay(1000);
  }
  throw new Error('La pile ne redevient pas disponible.');
}

try {
  await compose(['build', 'core']);
  await compose(['run', '--rm', 'test-db']);
  await compose(['up', '--wait', '--wait-timeout', '120']);
  const url = `http://${await compose(['port', 'bff', '3000'], true)}`;
  await probe(url, '/api/ready', 200);
  const page = await probe(url, '/settings', 200);
  assert.match(await page.text(), /<div id="root">/u);
  assert.equal((await (await probe(url, '/api/bootstrap', 200)).json()).core.status, 'ok');

  // Une donnée témoin technique ; aucune donnée métier ni accès à une base existante.
  await compose([
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'postgres',
    '-d',
    `orkobi_verify_${id}`,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    "CREATE TABLE orkobi_infrastructure.restart_probe (value text); INSERT INTO orkobi_infrastructure.restart_probe VALUES ('persisted');",
  ]);
  await compose(['stop', 'postgres']);
  await probe(url, '/api/health', 200);
  await probe(url, '/api/ready', 503);
  await compose(['start', 'postgres']);
  await waitReady(url);

  await compose(['restart', 'core', 'bff']);
  // Docker peut réattribuer un port hôte aléatoire lors du redémarrage.
  const restartedUrl = `http://${await compose(['port', 'bff', '3000'], true)}`;
  await waitReady(restartedUrl);
  // Recréation complète des conteneurs ; le volume nommé est conservé.
  await compose(['down']);
  await compose(['up', '--wait', '--wait-timeout', '120']);
  const newUrl = `http://${await compose(['port', 'bff', '3000'], true)}`;
  await probe(newUrl, '/api/ready', 200);
  const value = await compose(
    [
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'postgres',
      '-d',
      `orkobi_verify_${id}`,
      '-Atc',
      'SELECT value FROM orkobi_infrastructure.restart_probe',
    ],
    true,
  );
  assert.equal(value, 'persisted');
  await writeFile(
    new URL('result.json', directory),
    JSON.stringify(
      {
        passed: true,
        checks: [
          'migrations',
          'rollback',
          'concurrency',
          'checksums',
          'database_roles',
          'http',
          'database_outage',
          'service_restart',
          'container_recreation',
          'volume_persistence',
        ],
      },
      null,
      2,
    ),
  );
  process.stdout.write(
    'Infrastructure vérifiée : migrations, HTTP, panne SQL, redémarrage et persistance.\n',
  );
} catch (error) {
  const logs = await compose(
    ['logs', '--no-color', '--tail', '80', 'core', 'bff', 'postgres'],
    true,
  );
  await writeFile(new URL('failure.log', directory), logs);
  throw error;
} finally {
  // Nettoyage des conteneurs de test uniquement ; aucun volume n'est supprimé.
  try {
    await compose(['down']);
  } finally {
    await unlink(envFile);
  }
  process.stdout.write(`Volume de test conservé : orkobi-verify-${id}_postgres_data\n`);
}
