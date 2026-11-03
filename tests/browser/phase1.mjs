/* global document, window, requestAnimationFrame, URL, fetch */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Invoked by playwright-cli run-code.
async function checkPlatform(page) {
  const base = new URL(page.url()).origin;
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const screenshot = async (name) => {
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    check(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `Overflow ${name}`,
    );
    await page.screenshot({
      path: `output/playwright/phase1-${name}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  };
  const password = 'A browser test passphrase 2026!';
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Le jeton de cette base de recette est rempli séparément sans être écrit dans le scénario.
  check(
    (await page.locator('[name="setupToken"]').inputValue()).length === 64,
    'Test installation token must be supplied',
  );
  await page.getByLabel('Nom affiché', { exact: true }).fill('Camille Martin');
  await page.getByLabel('Adresse e-mail', { exact: true }).fill('camille@example.org');
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Installer Orkobi', exact: true }).click();
  await page.getByRole('heading', { name: 'Bienvenue dans votre espace', exact: true }).waitFor();
  await screenshot('login-desktop');
  await page.getByLabel('Adresse e-mail', { exact: true }).fill('camille@example.org');
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Votre espace de travail · Camille Martin', exact: true })
    .waitFor();
  await page.goto(`${base}/admin`);
  await page.getByRole('heading', { name: 'Créer un utilisateur', exact: true }).waitFor();
  await page.getByLabel('Nom affiché', { exact: true }).fill('Alex Dubois');
  await page.getByLabel('Adresse e-mail', { exact: true }).fill('alex@example.org');
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Créer un utilisateur', exact: true }).click();
  await page.getByRole('cell', { name: 'Alex Dubois', exact: true }).waitFor();
  await screenshot('users-desktop');
  await page.getByRole('button', { name: 'Organisations', exact: true }).click();
  for (const [name, kind, owner] of [
    ['Atelier Horizon', 'business', 'Alex Dubois · alex@example.org'],
    ['Collectif Rivage', 'association', 'Camille Martin · camille@example.org'],
  ]) {
    await page.getByLabel('Nom de l’organisation', { exact: true }).fill(name);
    await page.getByRole('combobox', { name: 'Type de structure', exact: true }).selectOption(kind);
    await page
      .getByRole('combobox', { name: 'Administrateur initial', exact: true })
      .selectOption({ label: owner });
    await page.getByRole('button', { name: 'Créer une organisation', exact: true }).click();
    await page.getByRole('cell', { name, exact: true }).waitFor();
  }
  await screenshot('organizations-admin-desktop');
  await page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'Atelier Horizon', exact: true }) })
    .getByRole('button', { name: 'Gérer', exact: true })
    .click();
  await page.getByRole('heading', { name: 'Membres', exact: true }).waitFor();
  await page.getByLabel('Adresse e-mail', { exact: true }).fill('camille@example.org');
  await page
    .getByRole('combobox', { name: 'Rôle', exact: true })
    .selectOption({ label: 'Administrateur d’organisation' });
  const membershipForm = page
    .locator('form')
    .filter({ has: page.getByRole('heading', { name: 'Attribuer un accès', exact: true }) });
  await membershipForm.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByRole('cell', { name: 'camille@example.org', exact: true }).waitFor();
  await page.goto(`${base}/organizations`);
  await page.getByRole('heading', { name: 'Atelier Horizon', exact: true }).waitFor();
  await screenshot('organizations-desktop');
  const row = page
    .locator('.platform-row')
    .filter({ has: page.getByRole('heading', { name: 'Atelier Horizon', exact: true }) });
  await row.getByRole('button', { name: 'Ouvrir cet espace', exact: true }).click();
  await page.getByRole('heading', { name: 'Paramètres de l’organisation', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Rôles et permissions', exact: true }).click();
  await page.getByLabel('Nom du rôle', { exact: true }).fill('Coordination');
  await page.getByLabel('Consulter les membres et les rôles', { exact: true }).check();
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByRole('heading', { name: 'Coordination', exact: true }).waitFor();
  await screenshot('roles-desktop');
  await page.getByRole('button', { name: 'Membres', exact: true }).click();
  await page.getByRole('cell', { name: 'Alex Dubois', exact: true }).waitFor();
  await screenshot('members-desktop');
  await page.getByRole('button', { name: 'Journal d’audit', exact: true }).click();
  await page.getByRole('heading', { name: 'Actions récentes', exact: true }).waitFor();
  await page.getByRole('cell', { name: 'Camille Martin', exact: true }).first().waitFor();
  await screenshot('audit-desktop');
  await page.goto(`${base}/profile`);
  await page.getByRole('heading', { name: 'Sessions actives', exact: true }).waitFor();
  await screenshot('profile-desktop');
  await page.getByLabel('Nom affiché', { exact: true }).fill('Camille M.');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.locator('.account-link').getByText('Camille M.', { exact: true }).waitFor();
  await page.reload();
  await page.locator('.account-link').getByText('Camille M.', { exact: true }).waitFor();
  await page.getByRole('combobox', { name: 'Langue', exact: true }).selectOption('en');
  await page.getByRole('heading', { name: 'My profile', level: 1, exact: true }).waitFor();
  await page.goto(`${base}/admin`);
  await page.getByRole('heading', { name: 'Create user', exact: true }).waitFor();
  await screenshot('admin-english-desktop');
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('fr');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/organizations`);
  await page.getByRole('heading', { name: 'Atelier Horizon', exact: true }).waitFor();
  await screenshot('organizations-mobile');
  await page.getByRole('button', { name: 'Ouvrir la navigation', exact: true }).click();
  check(await page.locator('dialog').evaluate((dialog) => dialog.open), 'Mobile drawer must open');
  await screenshot('navigation-mobile');
  await page.keyboard.press('Escape');
  await page
    .getByRole('combobox', { name: 'Choisir une organisation', exact: true })
    .selectOption({ label: 'Atelier Horizon' });
  await page.getByRole('heading', { name: 'Paramètres de l’organisation', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Membres', exact: true }).click();
  await page.getByRole('cell', { name: 'Alex Dubois', exact: true }).waitFor();
  await screenshot('members-mobile');
  await page.getByRole('button', { name: 'Changer de thème', exact: true }).click();
  await screenshot('members-dark-mobile');
  await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
  await page.getByRole('heading', { name: 'Bienvenue dans votre espace', exact: true }).waitFor();
  await screenshot('login-mobile');
  await page.getByLabel('Adresse e-mail', { exact: true }).fill('alex@example.org');
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Votre espace de travail · Alex Dubois', exact: true })
    .waitFor();
  check(
    (await page.locator('.platform-row').count()) === 1,
    'Delegated user must see exactly their own organization',
  );
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/platform/admin/users');
    return response.status;
  });
  check(result === 403, 'Delegated user cannot access platform users');
  await screenshot('delegated-home-mobile');
  check(failures.length === 0, `Page errors: ${failures.join('; ')}`);
  return {
    passed: true,
    screenshots: 14,
    checks: [
      'installation',
      'login',
      'users',
      'two organizations',
      'delegation',
      'roles',
      'members',
      'audit',
      'profile',
      'FR/EN',
      'reload persistence',
      'mobile',
      'dark theme',
      'logout',
      'platform access denied',
    ],
  };
}
