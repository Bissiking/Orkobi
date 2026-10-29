/* global URL, document */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- playwright-cli loads and invokes this function.
async function checkHotRefresh(page) {
  const base = new URL(page.url()).origin;
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource'))
      errors.push(message.text());
  });
  await page.goto(`${base}/settings`);
  await page.locator('#preferred-language').selectOption('en');
  await page.getByRole('radio', { name: /Dark/ }).check();
  await page.getByRole('link', { name: 'Service status', exact: true }).click();
  await page.getByRole('heading', { name: 'Your services at a glance.' }).waitFor();
  // Pendant cette attente, modifier le mtime de apps/core/src/health.controller.ts.
  // Le superviseur recompile les contrats et Vite doit recharger le Provider seul.
  await page.waitForEvent('console', {
    predicate: (message) =>
      message.text().includes('hot updated') && message.text().includes('/src/api.tsx'),
    timeout: 30000,
  });
  await page.getByRole('heading', { name: 'Your services at a glance.' }).waitFor();
  if ((await page.locator('html').getAttribute('data-theme')) !== 'dark')
    throw new Error('Theme lost during HMR');
  if (!page.url().endsWith('/system')) throw new Error('Route lost during HMR');
  for (let attempt = 0; attempt < 25; attempt++) {
    const response = await page.request.get(`${base}/api/health`);
    if (response.status() === 200) break;
    await page.waitForTimeout(200);
  }
  await page
    .getByRole('button', { name: /^(Refresh|Try again)$/ })
    .first()
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll('.service-state.available').length === 2,
  );
  if (errors.length) throw new Error(errors.join('; '));
  return { result: 'PHASE_03_HMR_PASS', errors };
}
