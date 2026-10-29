/* global console, document, localStorage, window, URL, requestAnimationFrame */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- playwright-cli loads and invokes this function.
async function checkWeb(page) {
  const base = new URL(page.url()).origin;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const failures = [];
  const requests = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('request', (request) => requests.push(request.url()));
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const shot = async (name) => {
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.screenshot({
      path: `.impeccable/review/${name}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    check(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `Overflow: ${name}`,
    );
  };
  const waitModules = async (count) =>
    page.waitForFunction(
      (expected) => document.querySelectorAll('.module-item').length === expected,
      count,
    );
  const navigate = async (path) => {
    await page.goto(`${base}${path}`);
    await page.locator('h1').waitFor();
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigate('/');
  await page.evaluate(() =>
    localStorage.setItem('orkobi.preferences', JSON.stringify({ locale: 'fr', theme: 'light' })),
  );
  const bootstrapResponse = page.waitForResponse(
    (response) => response.url() === `${base}/api/bootstrap` && response.status() === 200,
  );
  await page.reload();
  const bootstrap = await (await bootstrapResponse).json();
  check(bootstrap.core.status === 'ok', 'Real Core must be available');
  await page.getByRole('heading', { level: 1, name: 'Votre organisation. Vos outils.' }).waitFor();
  await shot('desktop');
  await page.getByRole('link', { name: 'Organisations', exact: true }).click();
  await page.getByRole('heading', { name: 'Un espace pour chaque organisation.' }).waitFor();
  check(
    await page.getByRole('button', { name: 'Créer une organisation' }).isDisabled(),
    'Organization creation must remain unavailable',
  );
  await shot('organizations-desktop');
  await page.getByRole('link', { name: 'Modules', exact: true }).click();
  await waitModules(6);
  check((await page.locator('.module-item').count()) === 6, 'Six planned modules');
  await page.getByRole('button', { name: 'Associations', exact: true }).click();
  await waitModules(4);
  check((await page.locator('.module-item').count()) === 4, 'Association filter');
  await page.getByRole('searchbox', { name: 'Rechercher un module' }).fill('cotisations');
  await waitModules(1);
  check((await page.locator('.module-item').count()) === 1, 'Module search');
  check(
    page.url().includes('audience=association') && page.url().includes('q=cotisations'),
    'URL stores filters',
  );
  await page.reload();
  await page.getByRole('heading', { name: 'Membres et cotisations', exact: true }).waitFor();
  check(
    (await page.getByRole('searchbox').inputValue()) === 'cotisations',
    'Search survives reload',
  );
  await page.getByRole('link', { name: 'Préférences', exact: true }).click();
  await page.goBack();
  await page.getByRole('heading', { name: 'Membres et cotisations', exact: true }).waitFor();
  await page.getByRole('searchbox').fill('unmatched-example');
  await page.getByRole('heading', { name: 'Aucun module ne correspond.' }).waitFor();
  await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click();
  await waitModules(6);
  check((await page.locator('.module-item').count()) === 6, 'Reset filters');
  await shot('modules-desktop');
  await page.getByRole('link', { name: 'Préférences', exact: true }).click();
  await page.locator('#preferred-language').selectOption('en');
  await page.getByRole('heading', { name: 'A workspace that feels like yours.' }).waitFor();
  check((await page.locator('html').getAttribute('lang')) === 'en', 'Document language');
  await page.getByRole('radio', { name: /Dark/ }).check();
  check((await page.locator('html').getAttribute('data-theme')) === 'dark', 'Dark theme applied');
  await page.reload();
  await page.getByRole('radio', { name: /Dark/ }).waitFor();
  check(await page.getByRole('radio', { name: /Dark/ }).isChecked(), 'Theme survives reload');
  await shot('settings-dark-desktop');
  await page.getByRole('radio', { name: /System/ }).check();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.getByRole('link', { name: 'Service status', exact: true }).click();
  const refreshed = page.waitForResponse(`${base}/api/bootstrap`);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await refreshed;
  await page.getByRole('button', { name: 'Refresh', exact: true }).waitFor();
  check(
    (await page.locator('.service-state.available').count()) === 2,
    'Real BFF and Core are available',
  );
  await shot('system-desktop');
  await page.route('**/api/bootstrap', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...bootstrap, core: { status: 'unavailable', reason: 'timeout' } }),
    }),
  );
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByText('The core service is temporarily unavailable.', { exact: true }).waitFor();
  check(
    (await page.locator('.service-state.unavailable').count()) === 1,
    'Core outage is distinct from BFF outage',
  );
  await shot('system-core-unavailable');
  await page.unroute('**/api/bootstrap');
  await page.route('**/api/bootstrap', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion":99}' }),
  );
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByText('The interface service is not responding.', { exact: true }).waitFor();
  check(
    (await page.locator('.service-state.unavailable').count()) === 2,
    'Invalid contract does not produce a healthy status',
  );
  await page.unroute('**/api/bootstrap');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.service-state.available').length === 2,
  );
  await navigate('/unknown-page');
  await page.getByRole('heading', { name: 'This page could not be found.' }).waitFor();
  await page.getByRole('link', { name: 'Back to home' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await shot('mobile');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('dialog').waitFor();
  await shot('mobile-navigation');
  await page.keyboard.press('Escape');
  check(!(await page.getByRole('dialog').isVisible()), 'Escape closes navigation');
  check(
    await page
      .getByRole('button', { name: 'Open navigation' })
      .evaluate((node) => node === document.activeElement),
    'Drawer restores focus',
  );
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Modules', exact: true }).click();
  await page.getByRole('heading', { name: 'Modules that fit your needs.' }).waitFor();
  check(!(await page.getByRole('dialog').isVisible()), 'Navigation closes after selecting a page');
  await shot('modules-mobile');
  await navigate('/settings');
  await page.getByRole('radio', { name: /Dark/ }).check();
  await shot('settings-dark-mobile');
  check(failures.length === 0, `Page errors: ${failures.join('; ')}`);
  check(
    !requests.some((url) => url.startsWith('http') && new URL(url).origin !== base),
    'Browser must only call its own origin',
  );
  console.log(
    JSON.stringify({
      result: 'PHASE_03_BROWSER_PASS',
      desktop: [1440, 1000],
      mobile: [390, 844],
      screenshots: 10,
      checks: [
        'routing',
        'reload',
        'back',
        'filters',
        'search',
        'empty',
        'FR/EN',
        'theme persistence',
        'system theme',
        'real BFF/Core',
        'simulated Core outage',
        'invalid BFF contract',
        'retry recovery',
        '404',
        'mobile drawer',
        'keyboard Escape',
        'focus restoration',
        'no overflow',
        'same-origin requests',
      ],
      pageErrors: failures,
    }),
  );
}
