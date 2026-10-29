/* global URL, document */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- playwright-cli loads and invokes this function.
async function checkDevelopment(page) {
  const base = new URL(page.url()).origin;
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/settings`);
  await page.locator('#preferred-language').selectOption('fr');
  await page.getByRole('radio', { name: /Sombre/ }).check();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.locator('#preferred-language').selectOption('en');
  await page.getByRole('heading', { name: 'A workspace that feels like yours.' }).waitFor();
  await page.getByRole('link', { name: 'Modules', exact: true }).click();
  await page.getByRole('searchbox').fill('projects');
  await page.waitForFunction(() => document.querySelectorAll('.module-item').length === 1);
  await page.reload();
  await page.getByRole('heading', { name: 'Projects', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Service status', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.service-state.available').length === 2,
  );
  if (errors.length) throw new Error(errors.join('; '));
  return { result: 'PHASE_03_DEV_PASS', errors };
}
