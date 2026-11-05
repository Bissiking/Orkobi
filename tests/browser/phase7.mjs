/* global document,window,Event,performance,URLSearchParams */
import { productVersion } from '../../apps/bff/dist/config.js';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import process from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const upstream = process.env.BUSINESS_BROWSER_URL;
assert.ok(
  upstream && /^http:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0):\d+$/u.test(upstream),
  'Recette réservée à une pile de test locale isolée.',
);
const out = process.env.BUSINESS_BROWSER_OUTPUT ?? 'output/playwright/phase7';
await mkdir(out, { recursive: true });
const puppeteer = await import(process.env.PUPPETEER_MODULE || 'puppeteer');
let vite,
  base = upstream;
if (process.env.WEB_TEST_MODE === 'dev') {
  const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
  const { createServer } = await import(require.resolve('vite'));
  vite = await createServer({
    root: fileURLToPath(new URL('../../apps/web/', import.meta.url)),
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
      proxy: { '/api': { target: upstream, changeOrigin: false } },
    },
  });
  await vite.listen();
  base = `http://127.0.0.1:${vite.httpServer.address().port}`;
}
const browser = await puppeteer.default.launch({
  headless: true,
  ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}),
});
const checks = [],
  errors = [],
  requests = [],
  metrics = {};
let page, admin;
const clickText = async (page, selector, text) =>
  page.evaluate(
    (selector, text) => {
      const button = [...document.querySelectorAll(selector)].find(
        (element) => element.textContent.trim() === text,
      );
      if (!button) throw new Error(`Contrôle introuvable : ${text}`);
      button.click();
    },
    selector,
    text,
  );
const goto = async (page, path) => page.goto(`${base}${path}`, { waitUntil: 'networkidle0' });
const setInput = async (page, selector, value) => {
  await page.$eval(selector, (input) => {
    input.focus();
    input.select();
  });
  await page.type(selector, value);
};
const noOverflow = async (page) =>
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1),
    false,
  );
async function login(page, email, locale = 'fr') {
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: 'light' },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await goto(page, '/login');
  await page.select('.language-control select', locale);
  await page.type('input[name=email]', email);
  await page.type('input[name=password]', 'A long secret passphrase 2026!');
  await page.click('form button[type=submit]');
  await page.waitForFunction(() => !window.location.pathname.startsWith('/login'));
}
async function selectOrganization(page) {
  await page.waitForSelector('.organization-selector select');
  const id = await page.$$eval(
    '.organization-selector option',
    (options) => options.find((option) => option.textContent === 'Phase 7 Alpha').value,
  );
  await page.select('.organization-selector select', id);
  await page.waitForFunction(() => window.location.pathname.startsWith('/organizations/'));
  return id;
}
try {
  page = await browser.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.method() === 'GET') requests.push(new URL(request.url()).pathname);
  });
  page.on('dialog', (dialog) => {
    errors.push(`Unexpected native dialog: ${dialog.type()}`);
    void dialog.dismiss();
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await goto(page, '/login');
  metrics.loginScripts = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((entry) => new URL(entry.name).pathname.endsWith('.js'))
      .map((entry) => ({ name: new URL(entry.name).pathname, bytes: entry.decodedBodySize })),
  );
  await login(page, 'business-owner@example.org');
  const orgId = await selectOrganization(page);
  checks.push('real_login_and_organization_selection');
  await goto(page, '/business/crm/contacts/new');
  await page.waitForSelector('input[name=name]');
  const bootstrap = await page.evaluate(async () => (await window.fetch('/api/bootstrap')).json());
  assert.equal(bootstrap.product.version, productVersion);
  assert.ok(
    (await page.$eval('.page-footer', (element) => element.textContent)).includes(productVersion),
  );
  checks.push('product_version_bootstrap_and_footer');
  const contactsBefore = requests.filter(
    (path) => path === '/api/platform/business/crm/contacts',
  ).length;
  await page.type('input[name=name]', 'Créé dans Chrome');
  await page.click('.business-editor button[type=submit]');
  await page.waitForFunction(() =>
    /\/business\/crm\/contacts\/[a-f0-9-]{36}$/u.test(window.location.pathname),
  );
  const contactUrl = page.url();
  await page.waitForSelector('.business-feedback[role="status"]');
  assert.equal(await page.$$eval('.business-feedback', (items) => items.length), 1);
  await page.waitForFunction(() => !document.querySelector('.business-feedback'), {
    timeout: 8000,
  });
  checks.push('single_announced_save_feedback_auto_dismiss');
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(page.url(), contactUrl);
  await page.waitForFunction(
    () => document.querySelector('.business-detail h1')?.textContent === 'Créé dans Chrome',
  );
  assert.equal(await page.$('input[name=name]'), null);
  assert.equal(
    requests.filter((path) => path === '/api/platform/business/crm/contacts').length,
    contactsBefore,
  );
  checks.push('read_and_create_skip_list_fetch');
  await clickText(page, '.business-detail button', 'Modifier');
  await page.waitForSelector('input[name=name]');
  await setInput(page, 'input[name=name]', 'Modification abandonnée');
  assert.ok(await page.$('.business-unsaved'));
  await clickText(page, '.business-editor button', 'Annuler');
  await page.waitForSelector('.confirm-dialog[open]');
  assert.equal(
    await page.$eval('.confirm-dialog button', (button) => button === document.activeElement),
    true,
  );
  await page.keyboard.press('Escape');
  assert.ok(await page.$('input[name=name]'));
  await clickText(page, '.business-editor button', 'Annuler');
  await page.waitForSelector('.confirm-dialog[open]');
  await clickText(page, '.confirm-dialog button', 'Confirmer');
  await page.waitForFunction(
    () => document.querySelector('.business-detail h1')?.textContent === 'Créé dans Chrome',
  );
  checks.push('real_crm_create_reload_and_cancel');
  await clickText(page, '.business-actions button', 'Archiver');
  await page.waitForSelector('dialog[open]');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  await clickText(page, '.business-actions button', 'Archiver');
  await page.waitForSelector('dialog[open]');
  await page.click('dialog[open] button[type=submit]');
  await page.waitForFunction(
    () => document.querySelector('.business-detail .status-pill')?.textContent === 'Archivée',
  );
  checks.push('keyboard_confirmation_and_real_archive');
  await goto(page, '/business/sales/quotes/new');
  await page.waitForSelector('input[name=validUntil]');
  await page.waitForFunction(
    () => document.querySelectorAll('select[name=customerId] option').length > 1,
  );
  const customerId = await page.$$eval(
    'select[name=customerId] option',
    (options) =>
      options.find((option) => option.textContent.includes('Client encore changé'))?.value ??
      options[1].value,
  );
  await page.select('select[name=customerId]', customerId);
  await page.$eval('input[name=validUntil]', (element) => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(
      element,
      '2027-12-31',
    );
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(
    () => document.querySelectorAll('select[name=product_0] option').length > 1,
  );
  const productId = await page.$$eval(
    'select[name=product_0] option',
    (options) => options.find((option) => option.textContent.includes('BIEN-1')).value,
  );
  await page.select('select[name=product_0]', productId);
  const productReads = requests.filter(
    (path) => path === '/api/platform/business/products/products',
  ).length;
  await clickText(page, '.business-lines button', 'Ajouter une ligne');
  await clickText(page, '.business-lines button', 'Ajouter une ligne');
  await page.select('select[name=product_1]', productId);
  await page.select('select[name=product_2]', productId);
  await setInput(page, 'input[name=quantity_1]', '2.000');
  await page.click('button[aria-label="Retirer la ligne 1"]');
  assert.equal(await page.$eval('input[name=quantity_0]', (input) => input.value), '2.000');
  assert.equal(
    requests.filter((path) => path === '/api/platform/business/products/products').length,
    productReads,
  );
  await page.waitForFunction(() =>
    document.querySelector('.business-quote-estimate strong')?.textContent.includes('0,36'),
  );
  checks.push('shared_references_stable_lines_exact_estimate');
  metrics.productListRequestsForThreeLines = productReads;
  await page.click('.business-editor button[type=submit]');
  await page.waitForFunction(() =>
    /\/business\/sales\/quotes\/[a-f0-9-]{36}$/u.test(window.location.pathname),
  );
  const quoteUrl = page.url();
  await page.waitForSelector('.business-print');
  assert.equal(await page.$('.business-editor'), null);
  checks.push('real_quote_create');
  await clickText(page, '.business-detail button', 'Modifier');
  await page.waitForSelector('.business-lines');
  assert.equal(await page.$('.business-unsaved'), null);
  await page.click('button[aria-label="Retirer la ligne 1"]');
  await page.waitForSelector('.business-unsaved');
  await clickText(page, '.business-editor button', 'Annuler');
  await page.waitForSelector('.confirm-dialog[open]');
  await clickText(page, '.confirm-dialog button', 'Confirmer');
  await page.waitForSelector('.business-print');
  assert.equal(await page.$$eval('.business-document-lines tbody tr', (rows) => rows.length), 2);
  checks.push('quote_line_removal_is_dirty_and_cancel_preserves_saved_lines');
  await page.emulateMediaType('print');
  const pdf = await page.pdf({
    path: join(out, 'quote-print.pdf'),
    format: 'A4',
    printBackground: true,
  });
  assert.equal(
    /\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/u.exec(Buffer.from(pdf).toString('latin1'))?.[1],
    '1',
  );
  await page.emulateMediaType('screen');
  checks.push('quote_print');
  await goto(page, '/business/crm/contacts?q=Pagination%201');
  await page.waitForSelector('.business-table');
  await clickText(page, '.business-pagination button', 'Suivant');
  await page.waitForFunction(() => new URLSearchParams(window.location.search).has('cursor'));
  assert.equal(new URL(page.url()).searchParams.get('q'), 'Pagination 1');
  await page.waitForFunction(
    () =>
      !document.querySelector('.business-list')?.getAttribute('aria-busy') ||
      document.querySelector('.business-list')?.getAttribute('aria-busy') === 'false',
  );
  await clickText(page, '.business-pagination button', 'Précédent');
  await page.waitForFunction(() => !new URLSearchParams(window.location.search).has('cursor'));
  assert.equal(new URL(page.url()).searchParams.get('q'), 'Pagination 1');
  checks.push('pagination_preserves_filters');
  await goto(page, '/business/documents/files/new');
  await page.waitForSelector('input[type=file]');
  await page.type('input[name=name]', 'Pièce de recette UX');
  await writeFile(join(out, 'ux-upload.txt'), 'Document de recette UX.');
  const upload = await page.$('input[type=file]');
  await upload.uploadFile(join(out, 'ux-upload.txt'));
  await page.waitForFunction(
    () => !document.querySelector('.business-editor button[type=submit]').disabled,
  );
  await page.click('.business-editor button[type=submit]');
  await page.waitForFunction(() =>
    /\/business\/documents\/files\/[a-f0-9-]{36}$/u.test(window.location.pathname),
  );
  await page.waitForSelector('.business-detail');
  const download = page.waitForResponse((response) => response.url().endsWith('/download'));
  await clickText(page, '.business-detail button', 'Télécharger le document');
  assert.equal(
    Buffer.from((await (await download).json()).contentBase64, 'base64').toString(),
    'Document de recette UX.',
  );
  checks.push('real_file_upload_and_download');
  await page.select('.language-control select', 'en');
  await page.click('.topbar-controls > button');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.setViewport({ width: 390, height: 844 });
  await goto(page, new URL(quoteUrl).pathname);
  await page.waitForSelector('.business-print');
  await noOverflow(page);
  checks.push('mobile_english_dark');
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
  await goto(page, '/business/stock/balances');
  await page.waitForSelector('[role=alert]');
  fail = false;
  await page.click('[role=alert] button');
  await page.waitForSelector('.business-table');
  checks.push('synthetic_outage_retry');
  for (const path of [
    'products/products',
    'projects/tasks',
    'members/dues',
    'documents/files',
    'hr/leave',
  ]) {
    await goto(page, `/business/${path}`);
    await page.waitForSelector('.business-table');
    await noOverflow(page);
  }
  await goto(page, '/business/reports');
  await page.waitForSelector('.business-report');
  await noOverflow(page);
  checks.push('nine_module_routes');
  await goto(page, '/business/crm/contacts?q=aucune-correspondance-recette-7');
  await page.waitForSelector('.business-empty');
  assert.ok(
    (await page.$eval('.business-empty h2', (element) => element.textContent)).includes(
      'No matches',
    ),
  );
  checks.push('empty_filter');
  const approverContext = await browser.createBrowserContext(),
    approver = await approverContext.newPage();
  approver.on('pageerror', (error) => errors.push(error.message));
  await login(approver, 'business-approver@example.org', 'en');
  await selectOrganization(approver);
  await goto(approver, '/modules');
  await approver.waitForSelector('.module-directory-group');
  assert.ok(
    (await approver.$eval('.module-directory', (element) => element.textContent)).includes(
      'Human resources',
    ),
  );
  await goto(approver, '/business/crm/contacts');
  assert.ok(
    (await approver.$eval('main', (element) => element.textContent)).includes('do not have access'),
  );
  assert.equal(await approver.$('.business-table'), null);
  await approverContext.close();
  checks.push('least_privilege_module_access');
  const adminContext = await browser.createBrowserContext();
  admin = await adminContext.newPage();
  admin.on('pageerror', (error) => errors.push(error.message));
  await admin.setViewport({ width: 1440, height: 1000 });
  await login(admin, 'business-admin@example.org', 'en');
  await goto(admin, '/admin?tab=business');
  await admin.waitForSelector('.business-grant-panel');
  await admin.select('select[name=businessModule]', 'hr');
  await admin.select('select[name=organizationId]', orgId);
  await admin.waitForFunction(
    () => document.querySelectorAll('select[name=roleId] option').length > 1,
  );
  const roleId = await admin.$$eval(
    'select[name=roleId] option',
    (options) => options.find((option) => option.textContent === 'Approbation RH').value,
  );
  await admin.select('select[name=roleId]', roleId);
  await admin.waitForSelector('input[value="orkobi.hr:read"]');
  await admin.click('input[value="orkobi.hr:read"]');
  await admin.waitForSelector('.business-grant-panel [role=alert]');
  assert.equal(
    await admin.$eval(
      '.business-setup-step:nth-of-type(2) button[type=submit]',
      (button) => button.disabled,
    ),
    true,
  );
  await admin.click('input[value="orkobi.hr:read"]');
  assert.ok(
    !(await admin.$eval('.business-grant-panel', (element) => element.textContent)).includes(
      'orkobi.hr:approve',
    ),
  );
  checks.push('real_business_administration_permission_dependencies');
  await page.setViewport({ width: 1440, height: 1000 });
  await page.select('.language-control select', 'fr');
  await goto(page, '/business/crm/contacts');
  await page.waitForSelector('.business-table');
  assert.equal(await page.$$eval('th:not([scope="col"])', (items) => items.length), 0);
  assert.equal(
    await page.$$eval('.sidebar a[href="/modules"][aria-current="page"]', (items) => items.length),
    1,
  );
  const listMarkup = await page.$eval('.business-table tbody', (body) => body.textContent);
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 600,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await page.click('button[aria-label="Actualiser la liste"]');
  await page.waitForSelector('.business-list[aria-busy="true"]');
  assert.equal(await page.$('.business-list .skeleton'), null);
  assert.equal(await page.$eval('.business-table tbody', (body) => body.textContent), listMarkup);
  await page.waitForSelector('.business-list[aria-busy="false"]');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await cdp.detach();
  checks.push('swr_keeps_records_during_real_refresh_and_accessible_tables');
  const catalogReads = requests.filter((path) => path === '/api/platform/business').length;
  await clickText(page, '.sidebar a', 'Modules');
  await page.waitForSelector('.module-directory-group');
  assert.equal(requests.filter((path) => path === '/api/platform/business').length, catalogReads);
  checks.push('catalog_shared_across_client_routes');
  await goto(page, '/business/crm/contacts/new');
  await page.waitForSelector('input[name=name]');
  await page.type('input[name=name]', 'Garde de navigation');
  await clickText(page, '.sidebar a', 'Modules');
  await page.waitForSelector('.confirm-dialog[open]');
  await page.keyboard.press('Escape');
  assert.ok(page.url().endsWith('/business/crm/contacts/new'));
  const beforeContext = requests.length;
  const otherOrg = await page.$$eval(
    '.organization-selector option',
    (items) => items.find((item) => item.value && !item.selected)?.value,
  );
  if (otherOrg) {
    await page.select('.organization-selector select', otherOrg);
    await page.waitForSelector('.confirm-dialog[open]');
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => !document.querySelector('.organization-selector select').disabled,
    );
    assert.equal(
      await page.$eval('.organization-selector select', (select) => select.value),
      orgId,
    );
    assert.equal(requests.length, beforeContext);
  }
  await clickText(page, '.business-editor button', 'Annuler');
  await page.waitForSelector('.confirm-dialog[open]');
  await clickText(page, '.confirm-dialog button', 'Confirmer');
  await page.waitForSelector('.business-table');
  await goto(page, '/business/crm/contacts/new');
  await page.waitForSelector('input[name=name]');
  // A synthetically injected revision error verifies summary placement/focus without changing data.
  const failWrite = async (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/platform/business/crm/contacts'
    )
      return request.respond({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'business_error', reason: 'revision_conflict', field: 'name' },
        }),
      });
    return request.continue();
  };
  // Replace the existing outage handler for this one bounded assertion.
  page.removeAllListeners('request');
  page.on('request', failWrite);
  await page.type('input[name=name]', 'Erreur de recette');
  await page.click('.business-editor button[type=submit]');
  await page.waitForSelector('[data-error-summary] [role="alert"]');
  assert.equal(
    await page.$eval('[data-error-summary]', (summary) => summary === document.activeElement),
    true,
  );
  assert.equal(
    await page.$eval(
      '.platform-form',
      (form) =>
        form
          .querySelector('[data-error-summary]')
          .compareDocumentPosition(form.querySelector('.form-columns')) & 4,
    ),
    4,
  );
  await clickText(page, '.business-editor button', 'Annuler');
  await page.waitForSelector('.confirm-dialog[open]');
  await clickText(page, '.confirm-dialog button', 'Confirmer');
  await page.waitForSelector('.business-table');
  page.removeAllListeners('request');
  page.on('request', (request) => void request.continue());
  checks.push('async_route_and_context_cancel_and_error_summary_focus');
  await page.setViewport({ width: 390, height: 844 });
  await page.click('.menu-toggle');
  await page.waitForSelector('.mobile-drawer[open]');
  assert.equal(await page.$$eval('.mobile-drawer nav', (items) => items.length), 1);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.mobile-drawer[open]'));
  checks.push('single_drawer_navigation_landmark');
  await page.select('.language-control select', 'en');
  // One batched visual round after functional checks. Disable it for further service-only recipes.
  if (process.env.BUSINESS_BROWSER_CAPTURE !== 'false') {
    await page.setViewport({ width: 1440, height: 1000 });
    await page.select('.language-control select', 'fr');
    await page.click('.topbar-controls > button');
    await goto(page, '/modules');
    await page.waitForSelector('.module-directory-group');
    await page.screenshot({ path: join(out, 'modules-desktop-light-fr.png'), fullPage: true });
    await goto(page, `${new URL(quoteUrl).pathname}?edit=1`);
    await page.waitForSelector('.business-lines');
    await page.screenshot({ path: join(out, 'quote-editor-desktop-light-fr.png'), fullPage: true });
    await page.select('.language-control select', 'en');
    await page.click('.topbar-controls > button');
    await page.setViewport({ width: 390, height: 844 });
    await goto(page, new URL(quoteUrl).pathname);
    await page.waitForSelector('.business-print');
    await page.screenshot({ path: join(out, 'quote-mobile-dark-en.png'), fullPage: true });
    await goto(page, '/business/crm/contacts?q=Pagination%201');
    await page.waitForSelector('.business-table');
    await page.screenshot({ path: join(out, 'contacts-mobile-dark-en.png'), fullPage: true });
    await admin.screenshot({ path: join(out, 'permissions-desktop-light-en.png'), fullPage: true });
  }
  assert.deepEqual(errors, []);
  checks.push('no_page_errors');
  await writeFile(
    join(out, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        mode: vite ? 'vite-development' : 'production',
        checks,
        metrics,
        backend: 'Real isolated Core/BFF/PostgreSQL; one synthetic outage',
        errors,
      },
      null,
      2,
    ),
  );
  process.stdout.write(`Navigateur UX réussi : ${checks.join(', ')}\n`);
} catch (error) {
  await writeFile(
    join(out, 'failure.json'),
    JSON.stringify(
      {
        message: error.message,
        url: page?.url(),
        text: await page?.evaluate(() => document.body.innerText),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
  await vite?.close();
}
