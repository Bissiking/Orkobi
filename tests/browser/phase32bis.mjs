/* global window, URL, setTimeout, ErrorEvent */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- playwright-cli loads and invokes this function.
async function checkWeb(page) {
  const base = new URL(page.url()).origin;
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  const dismiss = async () => {
    await page.locator('.error-banner').getByRole('button').click();
    await page.locator('.error-banner').waitFor({ state: 'detached' });
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/`);
  await page.locator('h1').waitFor();
  check((await page.locator('.error-banner').count()) === 0, 'Banner hidden without errors');

  await page.evaluate(() => {
    setTimeout(() => {
      Promise.reject(new Error('browser-test-rejection'));
    }, 0);
  });
  await page.locator('.error-banner').waitFor();
  check(
    (await page.locator('.error-banner').innerText()).includes('browser-test-rejection'),
    'Banner shows the rejection message',
  );
  check(
    consoleErrors.some((line) => line.includes('browser-test-rejection')),
    'Structured console report for the rejection',
  );
  await dismiss();

  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('browser-test-window') }));
  });
  await page.locator('.error-banner').waitFor();
  check(
    (await page.locator('.error-banner').innerText()).includes('browser-test-window'),
    'Banner shows the window error',
  );
  check(
    consoleErrors.some((line) => line.includes('browser-test-window')),
    'Structured console report for the window error',
  );
  await dismiss();
}
