import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, unlink, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { verifyCatalog, verifyArtifact } from '../lib/store/dist/index.js';
const { fetch, AbortSignal } = globalThis;
const id = randomBytes(6).toString('hex'),
  project = `orkobi-store-test-${id}`,
  directory = resolve(`output/store/${id}`),
  keys = resolve(`output/store-keys/${id}`),
  token = randomBytes(32).toString('hex');
await mkdir(directory, { recursive: true });
const envFile = resolve(directory, '.env');
await writeFile(
  envFile,
  [
    `STORE_DIRECTORY_HOST=${directory}/registry`,
    'STORE_REPOSITORY_ID=demo',
    'STORE_PUBLISHED_PORT=0',
    `STORE_BEARER_TOKEN=${token}`,
  ].join('\n'),
  { mode: 0o600 },
);
function run(command, args, options = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? accept(stdout.trim()) : reject(new Error('Recette Store interrompue.')),
    );
  });
}
const compose = (args, publicMode = false) =>
  run(
    'docker',
    ['compose', '-p', project, '--env-file', envFile, '-f', 'compose.store.yaml', ...args],
    { env: { ...process.env, ...(publicMode ? { STORE_BEARER_TOKEN: '' } : {}) } },
  );
try {
  await run(process.execPath, ['scripts/store-keygen.mjs', keys]);
  await run(process.execPath, [
    'scripts/build-plugin.mjs',
    'examples/plugin-demo',
    resolve(directory, 'plugin.json'),
  ]);
  await run(process.execPath, [
    'scripts/store-publish.mjs',
    resolve(directory, 'registry'),
    'demo',
    resolve(keys, 'signing-private.pem'),
    resolve(directory, 'plugin.json'),
  ]);

  const publishArgs = [
    'scripts/store-publish.mjs',
    resolve(directory, 'registry'),
    'demo',
    resolve(keys, 'signing-private.pem'),
  ];
  await run(process.execPath, [...publishArgs, '--withdraw=community.cards@1.0.0']);
  const original = await readFile(resolve(directory, 'plugin.json'), 'utf8'),
    mutated = JSON.parse(original);
  mutated.code += '\n// altered';
  await writeFile(resolve(directory, 'plugin.json'), JSON.stringify(mutated));
  await assert.rejects(run(process.execPath, [...publishArgs, resolve(directory, 'plugin.json')]));
  await writeFile(resolve(directory, 'plugin.json'), original);
  await run(process.execPath, [...publishArgs, resolve(directory, 'plugin.json')]);
  await compose(['up', '--build', '--wait', '--wait-timeout', '120']);
  const base = async () => `http://${await compose(['port', 'store', '3002'])}`;
  let url = await base();
  assert.equal(
    (await fetch(`${url}/v1/catalog`, { signal: AbortSignal.timeout(5000) })).status,
    401,
  );
  const headers = { authorization: `Bearer ${token}` },
    publicKey = await readFile(resolve(keys, 'public-key.pem'), 'utf8');
  const response = await fetch(`${url}/v1/catalog`, { headers, signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  const signed = verifyCatalog(await response.json(), 'demo', [publicKey]);
  const release = signed.catalog.releases[0],
    artifact = await (
      await fetch(`${url}/v1/artifacts/${release.digest}`, {
        headers,
        signal: AbortSignal.timeout(5000),
      })
    ).json();
  verifyArtifact(artifact, release);
  assert.equal(
    (
      await fetch(`${url}/v1/catalog`, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(5000),
      })
    ).status,
    405,
  );
  await compose(['restart', 'store']);
  url = await base();
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      if ((await fetch(`${url}/ready`, { signal: AbortSignal.timeout(3000) })).status === 200) {
        ready = true;
        break;
      }
    } catch {
      // Le processus et le port sont en redémarrage.
    }
    await delay(250);
  }
  assert.equal(ready, true);
  await compose(['down']);
  await compose(['up', '--wait', '--wait-timeout', '120'], true);
  url = await base();
  assert.equal(
    (await fetch(`${url}/v1/catalog`, { signal: AbortSignal.timeout(5000) })).status,
    200,
  );
  const services = await compose(['ps', '--services']);
  assert.equal(services, 'store');
  await writeFile(
    resolve(directory, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        project,
        checks: [
          'keygen',
          'local_publication',
          'withdrawal_immutable_versions',
          'private_authentication',
          'catalog_signature',
          'artifact_digest',
          'read_only_api',
          'restart',
          'public_repository',
          'independent_service',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  try {
    await compose(['down']);
  } finally {
    await unlink(envFile);
    await rm(keys, { recursive: true, force: true });
  }
}
