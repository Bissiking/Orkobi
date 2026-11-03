/* global document, window, localStorage, URL, requestAnimationFrame */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Loaded by playwright-cli.
async function verifyPlatformFixes(page) {
  const base = new URL(page.url()).origin,
    password = 'A browser test passphrase 2026!';
  const unique = Date.now().toString(36),
    createdName = `Robin Test ${unique}`,
    createdRole = `Lecture ${unique}`;
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  const shot = async (name) => {
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    check(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `Overflow: ${name}`,
    );
    await page.screenshot({
      path: `output/playwright/phase1-${name}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() =>
    localStorage.setItem('orkobi.preferences', JSON.stringify({ locale: 'fr', theme: 'light' })),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
  await page.getByRole('heading', { name: 'Bienvenue dans votre espace', exact: true }).waitFor();
  await page.getByLabel('Adresse e-mail', { exact: true }).fill('camille@example.org');
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.locator('.account-link').getByText('Camille M.', { exact: true }).waitFor();
  await page.goto(`${base}/admin`);
  await page.getByRole('cell', { name: 'Alex Dubois', exact: true }).waitFor();
  await page.getByLabel('Nom affiché', { exact: true }).fill(createdName);
  await page.getByLabel('Adresse e-mail', { exact: true }).fill('alex@example.org');
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Créer un utilisateur', exact: true }).click();
  await page.getByRole('alert').waitFor();
  check(
    (await page.getByLabel('Adresse e-mail', { exact: true }).inputValue()) === 'alex@example.org',
    'Failed creation must retain fields',
  );
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(`robin-${unique}@example.org`);
  await page.getByRole('button', { name: 'Créer un utilisateur', exact: true }).click();
  await page.getByRole('cell', { name: createdName, exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('input[name="password"]').value === '');
  check(
    (await page.getByLabel('Nom affiché', { exact: true }).inputValue()) === '',
    'Creation name must reset',
  );
  await page.getByRole('status').filter({ hasText: 'Modifications enregistrées.' }).waitFor();
  await shot('users-desktop');
  await page.goto(`${base}/organizations`);
  await page
    .locator('.platform-row')
    .filter({ has: page.getByRole('heading', { name: 'Atelier Horizon', exact: true }) })
    .getByRole('button', { name: 'Ouvrir cet espace', exact: true })
    .click();
  await page.getByRole('button', { name: 'Rôles et permissions', exact: true }).click();
  await page.getByLabel('Nom du rôle', { exact: true }).fill(createdRole);
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByRole('heading', { name: createdRole, exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('input[name="name"]').value === '');
  await shot('roles-desktop');
  await page
    .locator('.role-row')
    .filter({ has: page.getByRole('heading', { name: 'Coordination', exact: true }) })
    .getByRole('button', { name: 'Modifier', exact: true })
    .click();
  await page
    .getByRole('heading', { name: 'Modifier le rôle · Coordination', exact: true })
    .waitFor();
  await shot('roles-edit-desktop');
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await page.getByRole('heading', { name: 'Créer un rôle', exact: true }).waitFor();
  check(
    (await page.getByLabel('Nom du rôle', { exact: true }).inputValue()) === '',
    'Cancel restores fresh role form',
  );
  await page.getByRole('button', { name: 'Membres', exact: true }).click();
  await page.getByRole('cell', { name: 'Alex Dubois', exact: true }).waitFor();
  await page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'Alex Dubois', exact: true }) })
    .getByRole('button', { name: 'Modifier', exact: true })
    .click();
  await page
    .getByRole('heading', { name: 'Modifier l’accès · Alex Dubois', exact: true })
    .waitFor();
  await shot('members-edit-desktop');
  check(
    (await page.getByLabel('Adresse e-mail', { exact: true }).getAttribute('readonly')) !== null,
    'Editing membership keeps its identity fixed',
  );
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await page.getByRole('heading', { name: 'Attribuer un accès', exact: true }).waitFor();
  check(
    (await page.getByLabel('Adresse e-mail', { exact: true }).inputValue()) === '',
    'Cancel restores fresh membership form',
  );
  await shot('members-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await shot('members-mobile');
  check(
    await page
      .locator('.table-scroll')
      .evaluate((element) => element.scrollWidth > element.clientWidth),
    'Mobile table scrolls locally rather than crushing columns',
  );
  await page
    .locator('.table-scroll')
    .evaluate((element) => (element.scrollLeft = element.scrollWidth));
  await shot('members-mobile-actions');
  await page.locator('.table-scroll').evaluate((element) => (element.scrollLeft = 0));
  await page.getByRole('button', { name: 'Changer de thème', exact: true }).click();
  await shot('members-dark-mobile');
  await page.goto(`${base}/system`);
  await page.getByRole('heading', { name: 'Base de données', exact: true }).waitFor();
  await shot('services-mobile');
  return {
    passed: true,
    checks: [
      'readable mobile tables',
      'failed form retains fields',
      'successful creation clears password and fields',
      'role editing names target',
      'membership editing names target',
      'cancel restores creation',
      'SQL status visible',
    ],
  };
}
