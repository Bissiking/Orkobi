import { productVersion } from '../../apps/bff/dist/config.js';
/* global document, window, localStorage, Event */
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import process from 'node:process';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { createBffApplication } from '../../apps/bff/dist/application.js';
import { loadBffConfig } from '../../apps/bff/dist/config.js';
import { JsonLogger } from '../../apps/bff/dist/logger.js';
const require = createRequire(import.meta.url),
  puppeteer = await import(process.env.PUPPETEER_MODULE || 'puppeteer');
const manifest = JSON.parse(
  await readFile(new URL('../../examples/plugin-demo/manifest.json', import.meta.url), 'utf8'),
);
const artifactPath = new URL('../../output/plugins/community.cards.json', import.meta.url).pathname;
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
          server: { port: 5190 },
        });
        await server.listen();
        return server;
      })()
    : undefined;
const base = vite ? 'http://127.0.0.1:5190' : await app.getUrl();
const browser = await puppeteer.default.launch({
  headless: true,
  ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}),
});
try {
  const page = await browser.newPage(),
    errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const orgId = '11111111-1111-4111-8111-111111111111',
    roleId = '22222222-2222-4222-8222-222222222222',
    userId = '33333333-3333-4333-8333-333333333333';
  let installed = false,
    records = [],
    removed = false,
    granted = false,
    fail = false;
  const permissions = [
    'organization:read',
    'modules:read',
    'modules:write',
    'community.cards:read',
    'community.cards:write',
  ];
  const org = {
    id: orgId,
    name: 'Atelier de recette',
    kind: 'business',
    active: true,
    locale: 'fr',
    timezone: 'Europe/Paris',
    permissions,
  };
  const entry = () => ({
    id: '44444444-4444-4444-8444-444444444444',
    values: { title: '', content: '' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return request.continue();
    const input = request.postData() ? JSON.parse(request.postData()) : undefined;
    let body,
      status = 200;
    const plugin = {
      id: manifest.module.id,
      manifest,
      digest: 'a'.repeat(64),
      installed: !removed,
      installedAt: new Date().toISOString(),
    };
    if (path === '/api/bootstrap')
      body = {
        schemaVersion: 2,
        product: { name: 'Orkobi', version: productVersion },
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
          csrfToken: 'test',
          activeOrganizationId: orgId,
          organizations: [org],
        };
      else if (endpoint === 'admin/plugins') body = { plugins: installed ? [plugin] : [] };
      else if (endpoint === 'admin/plugins/validate')
        body = { digest: 'a'.repeat(64), manifest: input.artifact.manifest };
      else if (endpoint === 'admin/plugins/install') {
        installed = true;
        body = { id: manifest.module.id, digest: 'a'.repeat(64) };
      } else if (endpoint === 'admin/plugins/community.cards/grants') {
        granted = true;
        body = { success: true };
      } else if (endpoint === 'admin/plugins/community.cards/remove') {
        removed = true;
        body = { success: true, dataRetained: true };
      } else if (endpoint === 'admin/organizations') body = [org];
      else if (endpoint === `admin/organizations/${orgId}/roles`)
        body = [
          {
            id: roleId,
            organizationId: orgId,
            name: 'Administrateur',
            builtin: 'admin',
            permissions,
          },
        ];
      else if (endpoint === 'admin/modules')
        body = {
          modules: [
            {
              ...manifest.module,
              enabled: false,
              active: false,
              missingCapabilities: [],
              unsatisfiedDependencies: [],
              organizationCount: 0,
            },
          ],
        };
      else if (endpoint === 'plugins') body = { plugins: [plugin] };
      else if (endpoint === 'modules')
        body = {
          modules: [
            {
              ...manifest.module,
              enabled: true,
              active: true,
              missingCapabilities: [],
              unsatisfiedDependencies: [],
            },
          ],
        };
      else if (endpoint === 'modules/community.cards/data/cards') {
        if (input) {
          const next = entry();
          next.values = input;
          records = [next];
          body = { entry: next };
        } else if (fail) {
          status = 503;
          body = { error: { code: 'unavailable' } };
        } else body = { entries: records };
      } else if (endpoint.endsWith('/delete')) {
        records = [];
        body = { success: true };
      } else if (endpoint.startsWith('modules/community.cards/data/cards/')) {
        records[0].values = input;
        body = { entry: records[0] };
      } else body = {};
    }
    await request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const click = async (text) =>
    page.evaluate((text) => {
      const button = [...document.querySelectorAll('main button')].find(
        (button) => button.textContent.trim() === text,
      );
      if (!button) throw new Error(`Missing button ${text}`);
      button.click();
    }, text);
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${base}/admin?tab=plugins`);
  await page.waitForSelector('input[type="file"]');
  const file = await page.$('input[type="file"]');
  await file.uploadFile(artifactPath);
  await page.waitForFunction(() =>
    [...document.querySelectorAll('main button')].some(
      (button) => button.textContent.trim() === 'Vérifier le paquet' && !button.disabled,
    ),
  );
  await click('Vérifier le paquet');
  await page.waitForFunction(() => document.querySelector('.plugin-review'));
  // La confirmation est une véritable contrainte HTML du formulaire.
  const before = installed;
  await click('Installer désactivée');
  assert.equal(installed, before);
  await page.click('.plugin-review ~ form input[type="checkbox"]');
  await click('Installer désactivée');
  await page.waitForSelector('.plugin-installed');
  await page.evaluate(() =>
    [...document.querySelectorAll('summary')]
      .find((summary) => summary.textContent.includes('Accorder ou retirer'))
      .click(),
  );
  await page.waitForSelector('.plugin-installed select');
  await page.select('.plugin-installed select', orgId);
  await page.waitForFunction(
    () => document.querySelectorAll('.plugin-installed select')[1]?.options.length > 1,
  );
  await page.evaluate((roleId) => {
    const select = document.querySelectorAll('.plugin-installed select')[1];
    select.value = roleId;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, roleId);
  await page.click('.plugin-installed input[type="checkbox"][required]');
  await click('Appliquer aux droits du rôle');
  await page.waitForFunction(
    () => [...document.querySelectorAll('.plugin-installed [role="status"]')].length > 0,
  );
  assert.equal(granted, true);

  await mkdir('output/playwright', { recursive: true });
  const prefix = process.env.WEB_TEST_MODE === 'dev' ? 'phase4-dev' : 'phase4';
  await page.screenshot({ path: `output/playwright/${prefix}-admin-desktop.png`, fullPage: true });
  await page.goto(`${base}/plugins/community.cards`);
  await page.waitForSelector('input[name="title"]');
  await page.type('input[name="title"]', 'Fiche de recette');
  await page.type('input[name="content"]', 'Contenu partagé');
  await click('Enregistrer');
  await page.waitForSelector('tbody');
  await click('Modifier');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('main h2')].some((h) =>
      h.textContent.includes('Modifier l’entrée'),
    ),
  );
  await page.$eval('input[name="title"]', (input) => {
    input.value = '';
  });
  await page.type('input[name="title"]', 'Fiche modifiée');
  await click('Enregistrer');
  await page.waitForFunction(() =>
    document.querySelector('tbody')?.textContent.includes('Fiche modifiée'),
  );
  await page.screenshot({ path: `output/playwright/${prefix}-plugin-desktop.png`, fullPage: true });
  await page.reload();
  await page.waitForSelector('tbody');
  assert.match(page.url(), /plugins\/community.cards/u);
  for (const [theme, locale] of [
    ['light', 'fr'],
    ['dark', 'en'],
  ]) {
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(
      ({ theme, locale }) =>
        localStorage.setItem('orkobi.preferences', JSON.stringify({ theme, locale })),
      { theme, locale },
    );
    await page.reload();
    await page.waitForSelector('tbody');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    assert.equal(await page.evaluate(() => document.documentElement.lang), locale);
    await page.screenshot({
      path: `output/playwright/${prefix}-plugin-${theme}-${locale}.png`,
      fullPage: true,
    });
  }
  await page.setViewport({ width: 1440, height: 1000 });
  await click('Delete');
  await page.waitForFunction(() => document.querySelector('input[type="checkbox"]'));
  await click('Delete this entry');
  assert.equal(records.length, 1);
  await page.click('input[type="checkbox"]');
  await click('Delete this entry');
  await page.waitForFunction(() => !document.querySelector('tbody'));
  fail = true;
  await page.reload();
  await page.waitForSelector('[role="alert"]');
  fail = false;
  await page.click('[role="alert"] button');
  await page.waitForSelector('input[name="title"]');
  await page.goto(`${base}/admin?tab=plugins`);
  await page.waitForSelector('.plugin-installed');
  await page.screenshot({ path: `output/playwright/${prefix}-admin-en.png`, fullPage: true });
  assert.deepEqual(errors, []);
  process.stdout.write(
    `${prefix}: installation confirmation, declarative CRUD, deletion confirmation, retry, direct URL, FR/EN, themes and mobile passed (synthetic API).\n`,
  );
} finally {
  await browser.close();
  await vite?.close();
  await app.close();
}
