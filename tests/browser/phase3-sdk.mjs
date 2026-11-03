/* global document, window, localStorage */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { createBffApplication } from '../../apps/bff/dist/application.js';
import { loadBffConfig } from '../../apps/bff/dist/config.js';
import { JsonLogger } from '../../apps/bff/dist/logger.js';
const require = createRequire(import.meta.url);
const puppeteer = await import(process.env.PUPPETEER_MODULE || 'puppeteer');
const app = await createBffApplication(loadBffConfig({}), new JsonLogger(() => {}));
await app.listen(0, '127.0.0.1');
const vite =
  process.env.WEB_TEST_MODE === 'dev'
    ? await (async () => {
        const { createServer } = await import(
          require.resolve('vite', { paths: [new URL('../../apps/web/', import.meta.url).pathname] })
        );
        const server = await createServer({
          root: new URL('../../apps/web/', import.meta.url).pathname,
          server: { port: 5189 },
        });
        await server.listen();
        return server;
      })()
    : undefined;
const base = vite ? 'http://127.0.0.1:5189' : await app.getUrl();
const browser = await puppeteer.default.launch({
  headless: true,
  ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}),
});
try {
  const page = await browser.newPage(),
    errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let jobs = [],
    fail = false,
    sequence = 0;
  const orgId = '11111111-1111-4111-8111-111111111111',
    userId = '22222222-2222-4222-8222-222222222222';
  const org = {
    id: orgId,
    name: 'Atelier de recette',
    kind: 'business',
    locale: 'fr',
    timezone: 'Europe/Paris',
    active: true,
    permissions: ['organization:read', 'modules:read', 'modules:write', 'demo:read'],
  };
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return request.continue();
    let body,
      status = 200;
    if (path === '/api/bootstrap')
      body = {
        schemaVersion: 2,
        product: { name: 'Orkobi', version: '0.2.0-EXP' },
        core: { status: 'ok' },
        features: { identity: 'available', organizations: 'available', modules: 'available' },
        checkedAt: new Date().toISOString(),
      };
    else {
      const endpoint = path.replace('/api/platform/', '');
      if (endpoint === 'status')
        body = { initialized: true, databaseReady: true, modulesReady: true };
      else if (endpoint === 'session')
        body = {
          user: {
            id: userId,
            name: 'Camille',
            email: 'camille@example.org',
            active: true,
            platformAdmin: true,
          },
          csrfToken: 'test-csrf',
          activeOrganizationId: orgId,
          organizations: [org],
        };
      else if (endpoint === 'modules')
        body = {
          modules: [
            {
              id: 'orkobi.demo',
              name: 'Notes de démonstration',
              version: '0.1.0',
              enabled: true,
              active: true,
              missingCapabilities: [],
              unsatisfiedDependencies: [],
            },
          ],
        };
      else if (endpoint === 'jobs') {
        if (request.method() === 'POST') {
          const input = JSON.parse(request.postData());
          const id = `33333333-3333-4333-8333-${String(++sequence).padStart(12, '0')}`;
          jobs.unshift({
            id,
            organizationId: orgId,
            createdBy: userId,
            ...input,
            status: 'pending',
            attempts: 0,
            runAt: input.runAt ?? new Date().toISOString(),
            intervalSeconds: input.intervalSeconds ?? null,
            lastError: null,
          });
          body = { id };
        } else if (fail) {
          status = 503;
          body = { error: { code: 'unavailable', message: 'Unavailable' } };
        } else body = { jobs, enabled: true };
      } else if (/^jobs\//u.test(endpoint)) {
        const [, id, action] = endpoint.split('/');
        jobs = jobs.map((job) =>
          job.id === id ? { ...job, status: action === 'cancel' ? 'cancelled' : 'pending' } : job,
        );
        body = { success: true };
      } else if (endpoint === 'mfa/status')
        body = { enabled: false, pending: false, recoveryCodesRemaining: 0 };
      else if (endpoint === 'oidc/status') body = { enabled: false, label: null };
      else if (endpoint === 'admin/integrations') body = { enabled: false };
      else if (endpoint === 'admin/organizations') body = [org];
      else if (['sessions', 'oidc', 'admin/integration-tokens'].includes(endpoint)) body = [];
      else body = {};
    }
    await request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${base}/jobs`);
  await page.waitForSelector('input[name="runAt"]');
  const click = async (text) =>
    page.evaluate((text) => {
      const button = [...document.querySelectorAll('main button')].find(
        (button) => button.textContent.trim() === text,
      );
      if (!button) throw new Error(`Missing ${text}`);
      button.click();
    }, text);
  await click('Planifier la tâche');
  await page.waitForFunction(() =>
    document.querySelector('tbody')?.textContent.includes('En attente'),
  );
  await click('Annuler');
  await page.waitForFunction(() =>
    document.querySelector('tbody')?.textContent.includes('Annulée'),
  );
  jobs[0].status = 'failed';
  jobs[0].lastError = 'timeout';
  await click('Actualiser');
  await page.waitForFunction(() =>
    document.querySelector('tbody')?.textContent.includes('Délai dépassé'),
  );
  await click('Relancer');
  await page.waitForFunction(() =>
    document.querySelector('tbody')?.textContent.includes('En attente'),
  );
  await mkdir('output/playwright', { recursive: true });
  const prefix = process.env.WEB_TEST_MODE === 'dev' ? 'phase3-dev' : 'phase3';
  await page.screenshot({ path: `output/playwright/${prefix}-jobs-desktop.png`, fullPage: true });
  fail = true;
  await click('Actualiser');
  await page.waitForSelector('[role="alert"]');
  fail = false;
  await click('Réessayer');
  await page.waitForSelector('tbody');
  for (const [width, height, theme, locale] of [
    [390, 844, 'light', 'fr'],
    [390, 844, 'dark', 'en'],
  ]) {
    await page.setViewport({ width, height });
    await page.evaluate(
      ({ theme, locale }) => {
        localStorage.setItem('orkobi.preferences', JSON.stringify({ theme, locale }));
      },
      { theme, locale },
    );
    await page.reload();
    await page.waitForSelector('tbody');
    assert.equal(await page.evaluate(() => document.documentElement.lang), locale);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      'Mobile horizontal overflow',
    );
    await page.screenshot({
      path: `output/playwright/${prefix}-jobs-${theme}-${locale}.png`,
      fullPage: true,
    });
  }
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${base}/profile`);
  await page.waitForSelector('input[name="currentPassword"]');
  await page.screenshot({ path: `output/playwright/${prefix}-profile.png`, fullPage: true });
  await page.goto(`${base}/admin?tab=integrations`);
  await page.waitForSelector('input[name="scopes"]');
  await page.screenshot({ path: `output/playwright/${prefix}-integrations.png`, fullPage: true });
  await page.goto(`${base}/modules`);
  await page.waitForSelector('.module-icon svg');
  assert.equal(
    await page.$$eval('.module-icon svg', (icons) =>
      icons.every((icon) => icon.getAttribute('fill') === 'currentColor'),
    ),
    true,
  );
  await page.screenshot({ path: `output/playwright/${prefix}-papicons.png`, fullPage: true });
  assert.deepEqual(errors, []);
  process.stdout.write(
    `${prefix}: browser tasks, retry, error, FR/EN, desktop/mobile, themes, profile and integrations passed (synthetic API).\n`,
  );
} finally {
  await browser.close();
  await vite?.close();
  await app.close();
}
