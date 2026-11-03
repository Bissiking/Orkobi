import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { generateKeyPairSync } from 'node:crypto';
import { storeFixture } from './helpers/store-fixture.mjs';
import {
  verifyCatalog,
  validateCatalog,
  verifyArtifact,
  artifactDigest,
  loadRepositories,
  fetchStoreJson,
  StoreTrustError,
  StoreUnavailableError,
} from '../lib/store/dist/index.js';
import { createStoreServer } from '../apps/store/dist/application.js';
const { fetch, structuredClone } = globalThis;
test('Store : signature, identité du dépôt, empreinte et compatibilité du manifeste', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'orkobi-store-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = await storeFixture(directory),
    signed = JSON.parse(await readFile(`${directory}/catalog.json`, 'utf8'));
  assert.equal(verifyCatalog(signed, 'demo', [fixture.keys.publicKey]).catalog.sequence, 1);
  const altered = structuredClone(signed);
  altered.catalog.releases[0].sqlEngines = ['mysql'];
  assert.throws(() => verifyCatalog(altered, 'demo', [fixture.keys.publicKey]), StoreTrustError);
  assert.throws(() => verifyCatalog(signed, 'other', [fixture.keys.publicKey]), StoreTrustError);
  const foreign = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { format: 'pem', type: 'spki' },
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
  });
  assert.throws(() => verifyCatalog(signed, 'demo', [foreign.publicKey]), StoreTrustError);
  assert.throws(
    () => verifyCatalog(signed, 'demo', [fixture.keys.publicKey], Date.now() + 8 * 86400000),
    StoreTrustError,
  );
  const malformed = structuredClone(signed.catalog);
  malformed.releases[0].sqlEngines = [['postgresql']];
  assert.throws(() => validateCatalog(malformed, 'demo'), StoreTrustError);
  assert.equal(
    verifyArtifact(fixture.artifact, signed.catalog.releases[0]).manifest.module.id,
    'community.storecards',
  );
  assert.throws(
    () =>
      verifyArtifact(
        { ...fixture.artifact, code: fixture.artifact.code + '\n' },
        signed.catalog.releases[0],
      ),
    StoreTrustError,
  );
});
test('Store HTTP autonome : public/privé, paquet altéré, méthodes et redirection refusées', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'orkobi-store-http-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = await storeFixture(directory),
    secret = 'private-store-sentinel-'.padEnd(64, 'x');
  const server = createStoreServer({
    directory,
    repositoryId: 'demo',
    publicKeys: [fixture.keys.publicKey],
    token: secret,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}/`,
    repo = {
      id: 'demo',
      name: 'Private',
      channel: 'private',
      url: base,
      publicKeys: [fixture.keys.publicKey],
      allowHttp: true,
      token: secret,
    };
  assert.equal((await fetch(`${base}health`)).status, 200);
  assert.equal((await fetch(`${base}v1/catalog`)).status, 401);
  assert.equal(
    (await fetch(`${base}v1/catalog`, { headers: { authorization: 'Bearer invalid' } })).status,
    401,
  );
  assert.equal((await fetch(`${base}v1/catalog`, { method: 'POST' })).status, 405);
  const signed = await fetchStoreJson(repo, 'v1/catalog', 263168);
  assert.equal(verifyCatalog(signed, 'demo', repo.publicKeys).keyId, signed.keyId);
  assert.equal(
    (await fetchStoreJson(repo, `v1/artifacts/${artifactDigest(fixture.artifact)}`, 90000)).code,
    fixture.artifact.code,
  );
  await writeFile(
    `${directory}/artifacts/${artifactDigest(fixture.artifact)}.json`,
    JSON.stringify({ ...fixture.artifact, code: 'export {};' }),
  );
  await assert.rejects(
    fetchStoreJson(repo, `v1/artifacts/${artifactDigest(fixture.artifact)}`, 90000),
    StoreUnavailableError,
  );
  assert.equal(
    (
      await fetch(`${base}v1/artifacts/../../public-key.pem`, {
        headers: { authorization: `Bearer ${secret}` },
      })
    ).status,
    404,
  );
  await assert.rejects(fetchStoreJson(repo, 'v1/catalog', 8), StoreTrustError);
  let followed = 0;
  const redirect = createServer((request, response) => {
    if (request.url === '/v1/catalog') {
      response.writeHead(302, { location: '/target' });
      response.end();
    } else {
      followed++;
      response.setHeader('content-type', 'application/json');
      response.end('{}');
    }
  });
  redirect.listen(0, '127.0.0.1');
  await once(redirect, 'listening');
  t.after(
    () =>
      new Promise((resolve) => {
        redirect.close(resolve);
        redirect.closeAllConnections();
      }),
  );
  await assert.rejects(
    fetchStoreJson(
      { ...repo, url: `http://127.0.0.1:${redirect.address().port}/` },
      'v1/catalog',
      263168,
    ),
    StoreUnavailableError,
  );
  assert.equal(followed, 0);
});
test('configuration des dépôts : opt-in HTTP, secrets et clés fermés, erreurs expurgées', async () => {
  const keys = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { format: 'pem', type: 'spki' },
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
  });
  const repo = {
    id: 'official',
    name: 'Official',
    channel: 'official',
    url: 'https://store.example.org/',
    publicKeys: [keys.publicKey],
  };
  assert.equal(loadRepositories(JSON.stringify([repo])).length, 1);
  assert.deepEqual(loadRepositories(undefined), []);
  for (const invalid of [
    { ...repo, url: 'http://store.example.org/' },
    { ...repo, url: 'https://secret:sentinel@store.example.org/' },
    { ...repo, url: 'https://store.example.org/?sentinel' },
    { ...repo, channel: 'private' },
    { ...repo, channel: ['private'] },
    { ...repo, publicKeys: [keys.privateKey] },
    { ...repo, token: 'sentinel\r\nheader' },
    [repo, repo],
  ]) {
    const value = Array.isArray(invalid) ? invalid : [invalid];
    assert.throws(
      () => loadRepositories(JSON.stringify(value)),
      (error) => !error.message.includes('sentinel'),
    );
  }
});
