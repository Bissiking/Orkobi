import { productVersion } from '../../apps/bff/dist/config.js';
import { Buffer } from 'node:buffer';
/* global document,window,Event */
import assert from 'node:assert/strict';
import process from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { URL } from 'node:url';
const base = process.env.BUSINESS_BROWSER_URL;
assert.ok(
  base && /^http:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0):\d+$/u.test(base),
  'Recette réservée à une pile de test locale isolée.',
);
const out = process.env.BUSINESS_BROWSER_OUTPUT ?? 'output/playwright/phase7';
await mkdir(out, { recursive: true });
const puppeteer = await import(process.env.PUPPETEER_MODULE || 'puppeteer');
const browser = await puppeteer.default.launch({
  headless: true,
  ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}),
});
const errors = [],
  checks = [];
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => void dialog.accept());
  await page.setViewport({ width: 1440, height: 1000 });
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: 'light' },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await page.goto(`${base}/login`, { waitUntil: 'networkidle0' });
  await page.type('input[name=email]', 'business-owner@example.org');
  await page.type('input[name=password]', 'A long secret passphrase 2026!');
  await page.click('form button[type=submit]');
  await page.waitForFunction(() => !window.location.pathname.startsWith('/login'));
  await page.waitForSelector('.organization-selector select');
  await page.select(
    '.organization-selector select',
    await page.$eval('.organization-selector option:nth-child(2)', (el) => el.value),
  );
  await page.waitForFunction(() => window.location.pathname.startsWith('/organizations/'));
  checks.push('real_login_and_organization_selection');
  await page.goto(`${base}/business/crm/contacts/new`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('input[name=name]');
  const bootstrap = await page.evaluate(async () => (await window.fetch('/api/bootstrap')).json());
  assert.equal(bootstrap.product.version, productVersion);
  assert.ok(
    (await page.$eval('.page-footer', (element) => element.textContent)).includes(productVersion),
  );
  checks.push('product_version_bootstrap_and_footer');
  if (process.env.BUSINESS_BROWSER_CAPTURE !== 'false')
    await page.screenshot({ path: join(out, 'crm-desktop-light-fr.png'), fullPage: true });
  await page.type('input[name=name]', 'Créé dans Chrome');
  await page.click('.platform-panel form button[type=submit]');
  await page.waitForFunction(() =>
    /\/business\/crm\/contacts\/[a-f0-9-]{36}$/u.test(window.location.pathname),
  );
  const recordUrl = page.url();
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(page.url(), recordUrl);
  await page.waitForFunction(
    () => document.querySelector('input[name=name]')?.value === 'Créé dans Chrome',
  );
  checks.push('real_crm_create_and_reload');
  await page.goto(`${base}/business/sales/quotes/new`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('input[name=validUntil]');
  await page.select(
    'select[name=customerId]',
    await page.$eval('select[name=customerId] option:nth-child(2)', (el) => el.value),
  );
  // Les entrées date utilisent une valeur ISO native, indépendante de la locale du navigateur.
  await page.$eval('input[name=validUntil]', (el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, '2027-12-31');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.select(
    'select[name=product_0]',
    await page.$eval('select[name=product_0] option:nth-child(2)', (el) => el.value),
  );
  await page.click('.platform-panel form button[type=submit]');
  await page.waitForFunction(() =>
    /\/business\/sales\/quotes\/[a-f0-9-]{36}$/u.test(window.location.pathname),
  );
  await page.waitForFunction(() => document.querySelector('select[name=customerId]')?.value !== '');
  checks.push('real_quote_create');
  const quoteUrl = page.url();
  await page.waitForSelector('.business-print');
  if (process.env.BUSINESS_BROWSER_CAPTURE !== 'false')
    await page.screenshot({ path: join(out, 'quote-desktop-light-fr.png'), fullPage: true });
  await page.select('.language-control select', 'en');
  await page.click('.topbar-controls > button');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.setViewport({ width: 390, height: 844 });
  if (process.env.BUSINESS_BROWSER_CAPTURE !== 'false')
    await page.screenshot({ path: join(out, 'quote-mobile-dark-en.png'), fullPage: true });
  assert.ok((await page.$eval('h1', (el) => el.textContent)).includes('Quotes'));
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
    false,
  );
  checks.push('mobile_english_dark');
  await page.emulateMediaType('print');
  const pdf = await page.pdf({
    path: join(out, 'quote-print.pdf'),
    format: 'A4',
    printBackground: true,
  });
  const pages = /\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/u.exec(
    Buffer.from(pdf).toString('latin1'),
  );
  assert.equal(pages?.[1], '1', 'Le devis court ne doit pas créer de page blanche.');
  await page.emulateMediaType('screen');
  checks.push('quote_print');
  // Une panne synthétique borne explicitement la preuve de l'état erreur/réessayer.
  let fail = true;
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    if (fail && new URL(request.url()).pathname === '/api/platform/business/stock/balances')
      return request.respond({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'unavailable' } }),
      });
    return request.continue();
  });
  await page.goto(`${base}/business/stock/balances`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[role=alert]');
  fail = false;
  await page.click('[role=alert] button');
  await page.waitForSelector('.business-table');
  checks.push('synthetic_outage_retry');
  await page.goto(`${base}/business/reports`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.business-report');
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
    false,
  );
  if (process.env.BUSINESS_BROWSER_CAPTURE !== 'false')
    await page.screenshot({ path: join(out, 'reports-mobile-dark-en.png'), fullPage: true });
  for (const path of [
    'products/products',
    'projects/tasks',
    'members/dues',
    'documents/files',
    'hr/leave',
  ]) {
    await page.goto(`${base}/business/${path}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.business-table');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
      false,
    );
  }
  checks.push('nine_module_routes');
  await page.goto(quoteUrl, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.business-print');
  await page.goto(`${base}/business/crm/contacts?q=aucune-correspondance-recette-7`, {
    waitUntil: 'networkidle0',
  });
  assert.ok((await page.$eval('.platform-panel', (el) => el.textContent)).includes('No records'));
  checks.push('empty_filter');
  const adminPage = await browser.newPage();
  adminPage.on('pageerror', (error) => errors.push(error.message));
  await adminPage.goto(`${base}/login`, { waitUntil: 'networkidle0' });
  // Même contexte navigateur : fermer explicitement la session avant l'autre connexion.
  if (!(await adminPage.$('input[name=email]'))) {
    await adminPage.click('.account-controls button');
    await adminPage.waitForSelector('input[name=email]');
  }
  await adminPage.type('input[name=email]', 'business-admin@example.org');
  await adminPage.type('input[name=password]', 'A long secret passphrase 2026!');
  await adminPage.click('form button[type=submit]');
  await adminPage.waitForFunction(() => !window.location.pathname.startsWith('/login'));
  await adminPage.goto(`${base}/admin?tab=business`, { waitUntil: 'networkidle0' });
  await adminPage.waitForSelector('.platform-panel form');
  assert.ok((await adminPage.$eval('h2', (el) => el.textContent)).includes('Business modules'));
  checks.push('real_business_administration');
  assert.deepEqual(errors, []);
  checks.push('no_page_errors');
  await writeFile(
    join(out, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        checks,
        backend: 'Real isolated Core/BFF/PostgreSQL, one synthetic outage',
        errors,
      },
      null,
      2,
    ),
  );
  process.stdout.write(`Navigateur Phase 7 réussi : ${checks.join(', ')}\n`);
} catch (error) {
  const pages = await browser.pages();
  await writeFile(
    join(out, 'failure.json'),
    JSON.stringify(
      {
        message: error.message,
        url: pages.at(-1)?.url(),
        text: await pages.at(-1)?.evaluate(() => document.body.innerText),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
