import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import { URL } from 'node:url';
import process from 'node:process';
import { createApplication } from '../apps/core/dist/application.js';
import { loadConfig, ConfigurationError } from '../apps/core/dist/config.js';
import { CoreExceptionFilter } from '../apps/core/dist/errors.js';
import { JsonLogger } from '../apps/core/dist/logger.js';
import { HealthController } from '../apps/core/dist/health.controller.js';

const requireCore = createRequire(new URL('../apps/core/package.json', import.meta.url));
const { HttpException } = requireCore('@nestjs/common');
const { fetch } = globalThis;

test('configuration : valeurs par défaut locales, explicites et immuables', () => {
  const config = loadConfig({});
  assert.deepEqual(config, {
    environment: 'development',
    host: '127.0.0.1',
    port: 3001,
    openApiEnabled: false,
  });
  assert.ok(Object.isFrozen(config));
  assert.deepEqual(
    loadConfig({
      NODE_ENV: 'production',
      CORE_HOST: '0.0.0.0',
      CORE_PORT: '4201',
      CORE_OPENAPI_ENABLED: 'true',
    }),
    {
      environment: 'production',
      host: '0.0.0.0',
      port: 4201,
      openApiEnabled: true,
      platform: { setupToken: '', secureCookies: true },
    },
  );
});

test('configuration : rejette les valeurs invalides sans les exposer', () => {
  for (const [key, values] of Object.entries({
    NODE_ENV: ['', 'secret-test'],
    CORE_HOST: ['', ' https://secret-test', 'host/path', 'a b'],
    CORE_PORT: ['', '0', '-1', '65536', '1.5', '3001secret-test', ' 3001'],
    CORE_OPENAPI_ENABLED: ['', '1', 'TRUE', 'secret-test'],
  })) {
    for (const value of values) {
      assert.throws(
        () => loadConfig({ [key]: value }),
        (error) => {
          assert.ok(error instanceof ConfigurationError);
          assert.ok(error.message.includes(key));
          assert.ok(!error.message.includes('secret-test'));
          return true;
        },
      );
    }
  }
});

async function startCore(t, openApiEnabled = false) {
  const logs = [];
  const app = await createApplication(
    { ...loadConfig({ NODE_ENV: 'test' }), openApiEnabled },
    new JsonLogger((line) => logs.push(JSON.parse(line))),
  );
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  return { url: await app.getUrl(), logs };
}

test('HTTP : vitalité réelle, corrélation générée et absence de données de requête dans les logs', async (t) => {
  const { url, logs } = await startCore(t);
  const response = await fetch(`${url}/health?token=secret-test`, {
    headers: {
      authorization: 'Bearer secret-test',
      cookie: 'session=secret-test',
      'x-request-id': 'secret-test',
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', service: 'orkobi-core' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('strict-transport-security'), null);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/u);
  assert.ok(!response.headers.get('content-security-policy').includes('upgrade-insecure-requests'));
  const id = response.headers.get('x-request-id');
  assert.match(id, /^[\da-f-]{36}$/u);
  const request = logs.find((line) => line.event === 'http_request' && line.correlationId === id);
  assert.equal(request.status, 200);
  assert.equal(request.method, 'GET');
  assert.equal(typeof request.durationMs, 'number');
  assert.ok(!JSON.stringify(logs).includes('secret-test'));
  const second = await fetch(`${url}/health`);
  assert.notEqual(second.headers.get('x-request-id'), id);
  await second.text();
});

test('HTTP : routes absentes et toutes les routes OpenAPI désactivées par défaut', async (t) => {
  const { url, logs } = await startCore(t);
  for (const path of [
    '/secret-test?token=secret-test',
    '/internal/docs',
    '/internal/docs/swagger-ui-init.js',
    '/internal/openapi.json',
    '/internal/docs-yaml',
  ]) {
    const response = await fetch(`${url}${path}`);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(await response.json(), {
      error: {
        code: 'not_found',
        message: 'Ressource introuvable.',
        correlationId: response.headers.get('x-request-id'),
      },
    });
  }
  assert.ok(!JSON.stringify(logs).includes('secret-test'));
});

test('HTTP : JSON invalide et corps trop volumineux utilisent le contrat d’erreur corrélé', async (t) => {
  const { url, logs } = await startCore(t);
  for (const [body, status] of [
    ['{"secret-test":', 400],
    [JSON.stringify({ token: 'secret-test'.repeat(12000) }), 413],
  ]) {
    const response = await fetch(`${url}/health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    assert.equal(response.status, status);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const payload = await response.json();
    assert.equal(payload.error.code, 'invalid_argument');
    assert.equal(payload.error.correlationId, response.headers.get('x-request-id'));
    assert.ok(!JSON.stringify(payload).includes('secret-test'));
  }
  assert.ok(!JSON.stringify(logs).includes('secret-test'));
});

test('HTTP : OpenAPI explicite décrit le vrai endpoint et sert Swagger en local', async (t) => {
  const { url } = await startCore(t, true);
  const response = await fetch(`${url}/internal/openapi.json`);
  assert.equal(response.status, 200);
  const document = await response.json();
  assert.equal(document.info.version, '0.2.0-EXP');
  assert.ok(document.paths['/health'].get.responses['200']);
  assert.equal(document.components.schemas.HealthResponse.properties.status.enum[0], 'ok');
  const page = await fetch(`${url}/internal/docs`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/u);
  assert.match(await page.text(), /swagger-ui/u);
  assert.equal((await fetch(`${url}/internal/docs-yaml`)).status, 404);
});

test('erreurs : codes HTTP communs et erreur inattendue sans fuite des détails', () => {
  const logs = [];
  const filter = new CoreExceptionFilter(new JsonLogger((line) => logs.push(JSON.parse(line))));
  for (const [exception, status, code] of [
    [new Error('password=secret-test'), 500, 'internal_error'],
    [new HttpException('secret-test', 400), 400, 'invalid_argument'],
    [new HttpException({ message: 'secret-test' }, 401), 401, 'unauthenticated'],
    [new HttpException('secret-test', 403), 403, 'forbidden'],
    [new HttpException('secret-test', 409), 409, 'conflict'],
    [new HttpException('secret-test', 429), 429, 'rate_limited'],
    [new HttpException('secret-test', 503), 503, 'unavailable'],
  ]) {
    let payload;
    let actualStatus;
    const response = {
      locals: { correlationId: 'request-a' },
      status(value) {
        actualStatus = value;
        return this;
      },
      json(value) {
        payload = value;
      },
    };
    filter.catch(exception, { switchToHttp: () => ({ getResponse: () => response }) });
    assert.equal(actualStatus, status);
    assert.equal(payload.error.code, code);
    assert.equal(payload.error.correlationId, 'request-a');
    assert.ok(!JSON.stringify(payload).includes('secret-test'));
  }
  assert.ok(!JSON.stringify(logs).includes('secret-test'));
});

test('HTTP : une exception inattendue du contrôleur produit une erreur 500 expurgée', async (t) => {
  const logs = [];
  const app = await createApplication(
    loadConfig({ NODE_ENV: 'test' }),
    new JsonLogger((line) => logs.push(JSON.parse(line))),
  );
  t.after(() => app.close());
  app.get(HealthController).health = () => {
    throw new Error('password=secret-test');
  };
  await app.listen(0, '127.0.0.1');
  const response = await fetch(`${await app.getUrl()}/health`);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'internal_error',
      message: 'Erreur interne du serveur.',
      correlationId: response.headers.get('x-request-id'),
    },
  });
  assert.ok(logs.some((line) => line.event === 'http_error' && line.level === 'error'));
  assert.ok(!JSON.stringify(logs).includes('secret-test'));
});

test('processus : une configuration invalide échoue avant l’écoute avec un log JSON sans valeur sensible', async () => {
  const child = spawn(process.execPath, ['apps/core/dist/main.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, CORE_PORT: 'secret-test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.setEncoding('utf8').on('data', (chunk) => {
    output += chunk;
  });
  const [code] = await once(child, 'close');
  assert.equal(code, 1);
  const log = JSON.parse(output.trim());
  assert.equal(log.event, 'core_start_failed');
  assert.match(log.reason, /CORE_PORT/u);
  assert.ok(!output.includes('secret-test'));
});

test(
  'processus : un port occupé échoue proprement et sans détail d’exception',
  { timeout: 15000 },
  async (t) => {
    const { url } = await startCore(t);
    const child = spawn(process.execPath, ['apps/core/dist/main.js'], {
      cwd: new URL('../', import.meta.url),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        CORE_HOST: '127.0.0.1',
        CORE_PORT: new URL(url).port,
        CORE_OPENAPI_ENABLED: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    t.after(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    });
    let output = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
      output += chunk;
    });
    const [code] = await once(child, 'close');
    assert.equal(code, 1);
    const lines = output
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(lines.at(-1).event, 'core_start_failed');
    assert.ok(!output.includes('EADDRINUSE'));
    assert.ok(!lines.some((line) => line.event === 'core_listening'));
  },
);
