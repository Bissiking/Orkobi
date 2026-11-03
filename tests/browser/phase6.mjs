/* global document,window,localStorage */
import assert from 'node:assert/strict';
import process from 'node:process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import { createBffApplication } from '../../apps/bff/dist/application.js';
import { loadBffConfig } from '../../apps/bff/dist/config.js';
import { JsonLogger } from '../../apps/bff/dist/logger.js';
import { storeFixture } from '../helpers/store-fixture.mjs';
import { artifactDigest, publicKeyId } from '../../lib/store/dist/index.js';
const { structuredClone } = globalThis;
const puppeteer = await import(process.env.PUPPETEER_MODULE || 'puppeteer');
const directory = await mkdtemp(join(tmpdir(), 'orkobi-store-browser-')),
  fixture = await storeFixture(directory),
  artifact = fixture.artifact;
artifact.manifest.module.version = '1.1.0';
artifact.manifest.module.permissions.push({
  key: 'community.storecards:export',
  description: 'Exporter les fiches.',
});
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
  let state = 'ready',
    empty = false,
    admin = true,
    installed = false,
    fail = false,
    installs = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setRequestInterception(true);
  const release = {
    manifest: artifact.manifest,
    digest: artifactDigest(artifact),
    sqlEngines: ['postgresql', 'mariadb', 'mysql'],
    publishedAt: new Date().toISOString(),
  };
  const repository = {
    id: 'demo',
    name: 'Atelier des extensions',
    channel: 'community',
    keyId: publicKeyId(fixture.keys.publicKey),
    state: 'ready',
    checkedAt: new Date().toISOString(),
  };
  const review = {
    reviewId: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    repository,
    release,
    previousVersion: '1.0.0',
    previousDigest: 'b'.repeat(64),
    previousOrigin: {
      repositoryId: 'demo',
      keyId: repository.keyId,
      catalogSequence: 1,
      digest: 'b'.repeat(64),
      verified: true,
    },
    newPermissions: ['community.storecards:export'],
    reasons: [],
    requiresDeactivation: false,
  };
  page.on('request', async (request) => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return request.continue();
    let body = {},
      status = 200;
    if (path === '/api/bootstrap')
      body = {
        schemaVersion: 2,
        product: { name: 'Orkobi', version: '0.2.0-EXP' },
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
    else if (path.endsWith('/admin/store')) {
      if (fail) {
        status = 503;
        body = { error: { code: 'unavailable', message: 'Unavailable' } };
      } else
        body = {
          repositories: empty
            ? []
            : [
                {
                  ...repository,
                  state,
                  releases:
                    state === 'ready'
                      ? [
                          {
                            id: artifact.manifest.module.id,
                            name: artifact.manifest.module.name,
                            description: artifact.manifest.module.description,
                            icon: 'notes',
                            version: '1.1.0',
                            digest: release.digest,
                            sqlEngines: release.sqlEngines,
                            installedVersion: installed ? '1.1.0' : '1.0.0',
                            installedDigest: installed ? release.digest : review.previousDigest,
                            update: !installed,
                            compatible: true,
                            reasons: [],
                          },
                        ]
                      : [],
                },
              ],
        };
    } else if (path.endsWith('/admin/store/review')) {
      body = structuredClone(review);
      if (installed) {
        body.previousVersion = '1.1.0';
        body.previousDigest = release.digest;
        body.reasons = ['version'];
      }
    } else if (path.endsWith('/admin/store/install')) {
      const input = JSON.parse(request.postData());
      assert.equal(input.acknowledgeSource, true);
      assert.equal(input.acknowledgeNewPermissions, true);
      installed = true;
      installs++;
      body = { id: artifact.manifest.module.id, digest: release.digest };
    }
    await request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const click = async (text) => {
    const found = await page.evaluate((text) => {
      const node = [...document.querySelectorAll('button')].find(
        (button) => button.textContent === text,
      );
      if (!node) return false;
      node.click();
      return true;
    }, text);
    assert.equal(found, true, text);
  };
  await mkdir('output/playwright', { recursive: true });
  await page.setViewport({ width: 1440, height: 1050 });
  await page.goto(base);
  await page.evaluate(() =>
    localStorage.setItem('orkobi.preferences', JSON.stringify({ theme: 'light', locale: 'fr' })),
  );
  await page.goto(`${base}/admin?tab=store`);
  await page.waitForSelector('tbody');
  await click('Examiner');
  await page.waitForSelector('.store-review');
  assert.match(page.url(), /plugin=community.storecards/u);
  assert.match(await page.$eval('.store-review', (node) => node.textContent), /Nouveau droit/u);
  assert.equal(await page.$eval('input[name="source"]', (node) => node.required), true);
  assert.equal(await page.$eval('input[name="permissions"]', (node) => node.required), true);
  await page.screenshot({
    path: 'output/playwright/phase6-review-desktop-fr-light.png',
    fullPage: true,
  });
  await click('Mettre à jour désactivée');
  assert.equal(installs, 0);
  await page.click('input[name="source"]');
  await page.click('input[name="permissions"]');
  await click('Mettre à jour désactivée');
  await page.waitForFunction(() => !document.querySelector('.store-review'));
  assert.equal(installs, 1);
  state = 'unavailable';
  await click('Actualiser le catalogue');
  await page.waitForSelector('[role="alert"]');
  assert.match(
    await page.$eval('[role="alert"]', (node) => node.textContent),
    /continuent à fonctionner/u,
  );
  state = 'untrusted';
  await click('Actualiser le catalogue');
  await page.waitForFunction(() =>
    document.querySelector('[role="alert"]')?.textContent.includes('n’a pas pu être vérifié'),
  );
  state = 'ready';
  fail = true;
  await click('Actualiser le catalogue');
  await page.waitForSelector('[role="alert"] button');
  fail = false;
  await click('Réessayer');
  await page.waitForSelector('tbody');
  for (const [theme, locale] of [
    ['dark', 'en'],
    ['light', 'fr'],
  ]) {
    installed = false;
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(
      ({ theme, locale }) =>
        localStorage.setItem('orkobi.preferences', JSON.stringify({ theme, locale })),
      { theme, locale },
    );
    await page.reload();
    await page.waitForSelector('tbody');
    await click(locale === 'fr' ? 'Examiner' : 'Review');
    await page.waitForSelector('.store-review');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    assert.equal(await page.evaluate(() => document.documentElement.lang), locale);
    await page.screenshot({
      path: `output/playwright/phase6-review-mobile-${locale}-${theme}.png`,
      fullPage: true,
    });
  }
  empty = true;
  await click('Actualiser le catalogue');
  await page.waitForFunction(() => document.body.textContent.includes('Aucun dépôt de confiance'));
  admin = false;
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.$('.store-review'), null);
  assert.equal(await page.$('section.platform-panel select'), null);
  assert.deepEqual(errors, []);
  process.stdout.write(
    'Phase 6 : catalogue/revue, nouveaux droits, confirmation, reprise, sources indisponibles/non fiables, URL, FR/EN, thèmes et mobile vérifiés (API synthétiques).\n',
  );
} finally {
  await browser.close();
  await app.close();
  await rm(directory, { recursive: true, force: true });
}
