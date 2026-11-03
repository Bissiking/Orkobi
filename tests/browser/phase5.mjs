import { productVersion } from '../../apps/bff/dist/config.js';
import { URL } from 'node:url';
/* global document, window, localStorage */
import assert from 'node:assert/strict';
import process from 'node:process';
import { mkdir } from 'node:fs/promises';
import { createBffApplication } from '../../apps/bff/dist/application.js';
import { loadBffConfig } from '../../apps/bff/dist/config.js';
import { JsonLogger } from '../../apps/bff/dist/logger.js';
const puppeteer = await import(process.env.PUPPETEER_MODULE || 'puppeteer');
const app = await createBffApplication(loadBffConfig({}), new JsonLogger(() => {}));
await app.listen(0, '127.0.0.1');
const base = await app.getUrl();
const browser = await puppeteer.default.launch({
  headless: true,
  ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}),
});
try {
  const page = await browser.newPage(),
    errors = [];
  let engine = 'postgresql',
    fail = false,
    admin = true,
    requests = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return request.continue();
    let body = {},
      status = 200;
    if (path === '/api/bootstrap')
      body = {
        schemaVersion: 2,
        product: { name: 'Orkobi', version: productVersion },
        core: { status: 'ok' },
        features: { identity: 'available', organizations: 'available', modules: 'available' },
        checkedAt: new Date().toISOString(),
      };
    else if (path.endsWith('/status'))
      body = { initialized: true, databaseReady: true, modulesReady: true };
    else if (path.endsWith('/session'))
      body = {
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Administrator',
          email: 'operator@example.org',
          active: true,
          platformAdmin: admin,
        },
        csrfToken: 'synthetic',
        activeOrganizationId: null,
        organizations: [],
      };
    else if (path.endsWith('/admin/runtime')) {
      requests++;
      if (fail) {
        status = 503;
        body = { error: { code: 'unavailable', message: 'Unavailable' } };
      } else
        body = {
          database: {
            engine,
            transactionalDdl: engine === 'postgresql',
            nativeArrays: engine === 'postgresql',
            nativeJson: engine !== 'mariadb',
            supportedVersion:
              engine === 'postgresql' ? '18' : engine === 'mysql' ? '8.4 LTS' : '11.4 LTS',
          },
          system: {
            sampledAt: new Date().toISOString(),
            uptimeSeconds: 3600,
            memory: { rssBytes: 128 * 1048576, heapUsedBytes: 64 * 1048576 },
            eventLoop: { p99Ms: 24.5 },
            http: { requests: 1450, serverErrors: 2, meanDurationMs: 18 },
          },
          jobs: { enabled: true, completed: 4, failed: 1 },
          cache: { mode: 'memory' },
        };
    }
    await request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await mkdir('output/playwright', { recursive: true });
  for (const [width, height, theme, locale, choice] of [
    [1440, 1050, 'light', 'fr', 'postgresql'],
    [390, 844, 'dark', 'en', 'mariadb'],
    [390, 844, 'light', 'fr', 'mysql'],
  ]) {
    engine = choice;
    await page.setViewport({ width, height });
    await page.goto(base);
    await page.evaluate(
      ({ theme, locale }) =>
        localStorage.setItem('orkobi.preferences', JSON.stringify({ theme, locale })),
      { theme, locale },
    );
    await page.goto(`${base}/system`);
    await page.waitForSelector('.diagnostic-values');
    assert.equal(await page.evaluate(() => document.documentElement.lang), locale);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    assert.match(
      await page.$eval('.diagnostic-values', (node) => node.textContent),
      new RegExp(choice),
    );
    await page.screenshot({
      path: `output/playwright/phase5-${choice}-${locale}-${theme}.png`,
      fullPage: true,
    });
  }
  fail = true;
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent === 'Actualiser le diagnostic')
      .click(),
  );
  await page.waitForSelector('[role="alert"]');
  fail = false;
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent === 'Réessayer')
      .click(),
  );
  await page.waitForSelector('.diagnostic-values');
  const count = requests;
  admin = false;
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(
    () => document.querySelector('h1') && !document.querySelector('.diagnostic-values'),
  );
  assert.equal(requests, count);
  assert.deepEqual(errors, []);
  process.stdout.write(
    'Phase 5 : diagnostic, erreurs/reprise, moteurs, droits UI, FR/EN, thèmes et mobile vérifiés avec API synthétique.\n',
  );
} finally {
  await browser.close();
  await app.close();
}
