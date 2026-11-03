import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
const { fetch, AbortSignal } = globalThis;
const id = randomBytes(6).toString('hex'),
  project = `orkobi-sql-${id}`;
const directory = new URL(`../output/sql-engines/${id}/`, import.meta.url);
await mkdir(directory, { recursive: true });
const envFile = new URL('.env', directory);
await writeFile(
  envFile,
  [
    `DB_NAME=orkobi_verify_${id}`,
    'DB_ENGINE=mariadb',
    'BFF_PUBLISHED_PORT=0',
    `INTERNAL_TOKEN=${randomBytes(32).toString('hex')}`,
    ...['SQL_ROOT_PASSWORD', 'MIGRATION_DB_PASSWORD', 'DB_PASSWORD'].map(
      (key) => `${key}=${randomBytes(32).toString('hex')}`,
    ),
  ].join('\n'),
  { mode: 0o600 },
);
const base = [
  'compose',
  '-p',
  project,
  '--env-file',
  fileURLToPath(envFile),
  '-f',
  'compose.sql-test.yaml',
];
function compose(args, engine = 'mariadb', stack = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      [
        ...(stack
          ? [
              'compose',
              '-p',
              `${project}-${engine}-stack`,
              '--env-file',
              fileURLToPath(envFile),
              '-f',
              'compose.mysql.yaml',
            ]
          : base),
        ...args,
      ],
      {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        env: {
          ...process.env,
          DB_ENGINE: engine,
          SQL_IMAGE: engine === 'mariadb' ? 'mariadb:11.4' : 'mysql:8.4',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '',
      stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (chunk) => {
        output += chunk;
        process.stdout.write(chunk);
      });
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0
        ? resolve(['port', 'exec'].includes(args[0]) ? stdout : output)
        : reject(new Error(`Recette ${engine} : ${args[0]} (${code}).`)),
    );
  });
}

async function probe(url, path, status) {
  const response = await fetch(`${url}${path}`, { signal: AbortSignal.timeout(8000) });
  assert.equal(response.status, status, path);
  return response;
}
async function ready(url) {
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(`${url}/api/ready`, { signal: AbortSignal.timeout(8000) })).ok) return;
    } catch {
      /* Redémarrage en cours. */
    }
    await delay(1000);
  }
  throw new Error('Readiness SQL non rétablie.');
}
const nativeScript =
  'client=mysql; command -v mariadb >/dev/null 2>&1 && client=mariadb; exec "$client" -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -N -e "$1"';
async function stackCheck(engine) {
  await compose(['up', '--wait', '--wait-timeout', '180'], engine, true);
  const url = () =>
    compose(['port', 'bff', '3000'], engine, true).then((value) => `http://${value.trim()}`);
  let baseUrl = await url();
  await probe(baseUrl, '/api/ready', 200);
  await probe(baseUrl, '/system', 200);
  await compose(
    [
      'exec',
      '-T',
      'sql',
      'sh',
      '-c',
      nativeScript,
      'probe',
      'CREATE TABLE orkobi_restart_probe AS SELECT 1 AS persisted',
    ],
    engine,
    true,
  );
  await compose(['stop', 'sql'], engine, true);
  await probe(baseUrl, '/api/health', 200);
  await probe(baseUrl, '/api/ready', 503);
  await compose(['start', 'sql'], engine, true);
  await ready(baseUrl);
  await compose(['pause', 'sql'], engine, true);
  try {
    await probe(baseUrl, '/api/health', 200);
    await probe(baseUrl, '/api/ready', 503);
  } finally {
    await compose(['unpause', 'sql'], engine, true);
  }
  await ready(baseUrl);
  await compose(['restart', 'core', 'bff'], engine, true);
  baseUrl = await url();
  await ready(baseUrl);
  await compose(['down'], engine, true);
  await compose(['up', '--wait', '--wait-timeout', '180'], engine, true);
  baseUrl = await url();
  await ready(baseUrl);
  const value = await compose(
    [
      'exec',
      '-T',
      'sql',
      'sh',
      '-c',
      nativeScript,
      'probe',
      'SELECT persisted FROM orkobi_restart_probe',
    ],
    engine,
    true,
  );
  assert.equal(value.trim(), '1');
  await compose(['down'], engine, true);
}

const passed = [];
try {
  await compose(['build', 'test']);
  await compose(['build', 'core'], 'mariadb', true);
  for (const engine of ['mariadb', 'mysql']) {
    await compose(['up', '--wait', '--wait-timeout', '180', engine], engine);
    const log = await compose(['run', '--rm', 'test'], engine);
    await writeFile(new URL(`${engine}.log`, directory), log);
    passed.push(engine);
    await compose(['stop', engine], engine);
    await stackCheck(engine);
  }
  await writeFile(
    new URL('result.json', directory),
    JSON.stringify(
      {
        passed,
        project,
        volumesPreserved: true,
        checks: [
          'migrations',
          'engine_mismatch',
          'checksums',
          'partial_ddl_refused',
          'runtime_privileges',
          'shared_business_suites',
          'http',
          'sql_outage',
          'sql_unresponsive_timeout',
          'process_restart',
          'container_recreation',
          'volume_persistence',
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  const logs = await compose(['logs', '--no-color', '--tail', '60']).catch(
    () => 'Logs indisponibles.',
  );
  await writeFile(new URL('failure.log', directory), logs);
  throw error;
} finally {
  try {
    for (const engine of ['mariadb', 'mysql']) await compose(['down'], engine, true);
    await compose(['down']);
  } finally {
    await unlink(envFile);
  }
  process.stdout.write(`Volumes de test conservés : ${project}\n`);
}
