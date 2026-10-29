import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { createBffApplication } from '../apps/bff/dist/application.js';
import { BffConfigurationError, loadBffConfig, productVersion } from '../apps/bff/dist/config.js';
import { probeCore } from '../apps/bff/dist/core-client.js';
import { JsonLogger } from '../apps/bff/dist/logger.js';
import { createApplication } from '../apps/core/dist/application.js';
import { loadConfig } from '../apps/core/dist/config.js';
import { isBffBootstrap, isCoreHealth } from '../lib/contracts/dist/index.js';

const { fetch } = globalThis;
async function upstream(t, handler) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}
async function startBff(t, coreUrl) {
  const logs = [];
  const app = await createBffApplication(
    { ...loadBffConfig({}), coreUrl, coreTimeoutMs: 100 },
    new JsonLogger((line) => logs.push(JSON.parse(line))),
  );
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  return { url: await app.getUrl(), logs };
}

test('BFF : configuration locale gelée et URL du Core exclusivement serveur', () => {
  assert.deepEqual(loadBffConfig({}), {
    host: '127.0.0.1',
    port: 3000,
    coreUrl: 'http://127.0.0.1:3001',
    coreTimeoutMs: 2000,
  });
  assert.ok(Object.isFrozen(loadBffConfig({})));
  assert.equal(
    loadBffConfig({ CORE_URL: 'https://core.example.invalid:443/' }).coreUrl,
    'https://core.example.invalid',
  );
  for (const [key, values] of Object.entries({
    BFF_PORT: ['0', '65536', 'secret-test'],
    BFF_HOST: ['', ' https://secret-test', 'host/path'],
    CORE_TIMEOUT_MS: ['0', '99', '10001', 'secret-test'],
    CORE_URL: [
      'secret-test',
      'file:///tmp/secret-test',
      'http://secret-test@localhost',
      'http://localhost/path',
      'http://localhost?secret-test',
      'http://localhost/#secret-test',
    ],
  }))
    for (const value of values)
      assert.throws(
        () => loadBffConfig({ [key]: value }),
        (error) => {
          assert.ok(error instanceof BffConfigurationError);
          assert.ok(error.message.includes(key));
          assert.ok(!error.message.includes('secret-test'));
          return true;
        },
      );
});

test('BFF ↔ Core : HTTP réel, contrat de bootstrap et aucun transfert de secrets navigateur', async (t) => {
  const core = await createApplication(loadConfig({ NODE_ENV: 'test' }), new JsonLogger(() => {}));
  t.after(() => core.close());
  await core.listen(0, '127.0.0.1');
  const { url, logs } = await startBff(t, await core.getUrl());
  const response = await fetch(`${url}/api/bootstrap?token=secret-test`, {
    headers: {
      authorization: 'Bearer secret-test',
      cookie: 'session=secret-test',
      'x-request-id': 'secret-test',
      origin: 'https://secret-test.invalid',
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const bootstrap = await response.json();
  assert.ok(isBffBootstrap(bootstrap));
  assert.equal(bootstrap.product.version, productVersion);
  assert.deepEqual(bootstrap.core, { status: 'ok' });
  assert.deepEqual(bootstrap.features, {
    identity: 'unavailable',
    organizations: 'unavailable',
    modules: 'unavailable',
  });
  assert.ok(!JSON.stringify(bootstrap).includes('secret-test'));
  assert.match(response.headers.get('x-request-id'), /^[\da-f-]{36}$/u);
  assert.ok(!JSON.stringify(logs).includes('secret-test'));
});

test('BFF : seule la route health est interrogée et les en-têtes utilisateur ne sont pas relayés', async (t) => {
  const coreUrl = await upstream(t, (request, response) => {
    assert.equal(request.url, '/health');
    assert.equal(request.headers.authorization, undefined);
    assert.equal(request.headers.cookie, undefined);
    assert.equal(request.headers.origin, undefined);
    assert.match(request.headers['x-request-id'], /^[\da-f-]{36}$/u);
    response
      .writeHead(200, { 'content-type': 'application/json' })
      .end('{"status":"ok","service":"orkobi-core"}');
  });
  const { url } = await startBff(t, coreUrl);
  const response = await fetch(`${url}/api/bootstrap?url=https://secret-test.invalid`, {
    headers: { authorization: 'secret-test', cookie: 'secret-test' },
  });
  assert.equal((await response.json()).core.status, 'ok');
});

test('BFF : réponse Core invalide, trop grande, erreur et redirection refusées', async (t) => {
  for (const [name, status, type, body] of [
    ['autre service', 200, 'application/json', '{"status":"ok","service":"other"}'],
    ['JSON invalide', 200, 'application/json', '{"secret-test":'],
    ['HTML', 200, 'text/html', '<html>secret-test</html>'],
    ['erreur amont', 500, 'application/json', '{"message":"secret-test"}'],
    ['redirection', 302, 'application/json', '{}'],
    [
      'corps trop gros',
      200,
      'application/json',
      JSON.stringify({ status: 'ok', service: 'orkobi-core', secret: 'secret-test'.repeat(1000) }),
    ],
  ])
    await t.test(name, async (subtest) => {
      let calls = 0;
      const coreUrl = await upstream(subtest, (request, response) => {
        calls++;
        response
          .writeHead(status, { 'content-type': type, location: '/redirect-secret-test' })
          .end(body);
      });
      assert.deepEqual(await probeCore({ ...loadBffConfig({}), coreUrl }, 'request-a'), {
        status: 'unavailable',
        reason: 'invalid_response',
      });
      assert.equal(calls, 1);
    });
});

test('BFF : timeout de réponse et de corps, indisponibilité explicite sans bloquer la vitalité', async (t) => {
  for (const flush of [false, true])
    await t.test(flush ? 'corps bloqué' : 'réponse bloquée', async (subtest) => {
      const coreUrl = await upstream(subtest, (_request, response) => {
        if (flush) {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.flushHeaders();
        }
      });
      const { url } = await startBff(subtest, coreUrl);
      const response = await fetch(`${url}/api/bootstrap`);
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).core, { status: 'unavailable', reason: 'timeout' });
      const health = await fetch(`${url}/api/health`);
      assert.deepEqual(await health.json(), { status: 'ok', service: 'orkobi-bff' });
    });
});

test('BFF : panne réseau amont et récupération à la requête suivante', async (t) => {
  let available = false;
  const coreUrl = await upstream(t, (request, response) => {
    if (!available) {
      request.socket.destroy();
      return;
    }
    response
      .writeHead(200, { 'content-type': 'application/json' })
      .end('{"status":"ok","service":"orkobi-core"}');
  });
  const { url } = await startBff(t, coreUrl);
  assert.deepEqual((await (await fetch(`${url}/api/bootstrap`)).json()).core, {
    status: 'unavailable',
    reason: 'unreachable',
  });
  available = true;
  assert.deepEqual((await (await fetch(`${url}/api/bootstrap`)).json()).core, { status: 'ok' });
});

test('BFF : routes React directes, CSP, ressources, erreurs API et absence de fichiers privés', async (t) => {
  const { url, logs } = await startBff(t, 'http://127.0.0.1:1');
  for (const path of [
    '/',
    '/organizations',
    '/modules?audience=business',
    '/settings',
    '/system',
    '/page-inconnue',
  ]) {
    const response = await fetch(`${url}${path}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'/u);
    assert.match(await response.text(), /id="root"/u);
  }
  for (const path of ['/api', '/api/secret-test', '/.env', '/assets/missing.js']) {
    const response = await fetch(`${url}${path}`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: {
        code: 'not_found',
        message: 'Ressource introuvable.',
        correlationId: response.headers.get('x-request-id'),
      },
    });
  }
  const script = await fetch(`${url}/theme-init.js`);
  assert.equal(script.status, 200);
  await script.text();
  const malformed = await fetch(`${url}/api/bootstrap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"secret-test":',
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, 'invalid_argument');
  assert.ok(!JSON.stringify(logs).includes('secret-test'));
});

test('contrats HTTP : validation runtime rejette les identités de service et schémas incohérents', () => {
  assert.ok(isCoreHealth({ status: 'ok', service: 'orkobi-core' }));
  for (const value of [null, [], {}, { status: 'ok', service: 'orkobi-bff' }])
    assert.equal(isCoreHealth(value), false);
  const valid = {
    schemaVersion: 1,
    product: { name: 'Orkobi', version: productVersion },
    core: { status: 'ok' },
    features: { identity: 'unavailable', organizations: 'unavailable', modules: 'unavailable' },
    checkedAt: new Date().toISOString(),
  };
  assert.ok(isBffBootstrap(valid));
  for (const value of [
    null,
    [],
    { ...valid, schemaVersion: 2 },
    { ...valid, core: { status: 'healthy' } },
    { ...valid, checkedAt: 'bad' },
    { ...valid, features: { ...valid.features, identity: 'active' } },
  ])
    assert.equal(isBffBootstrap(value), false);
});
