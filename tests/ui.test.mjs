import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { Button, Field, Notice, AppIcon } from '../sdk/ui/dist/index.js';
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { createElement } = require('react'),
  { renderToStaticMarkup } = require('react-dom/server'),
  { MemoryRouter } = require('react-router');
const render = (element) => renderToStaticMarkup(createElement(MemoryRouter, null, element));
test('SDK UI : boutons sans soumission implicite, liens désactivés et champs accessibles', () => {
  assert.match(render(createElement(Button, null, 'Action')), /type="button"/u);
  const link = render(createElement(Button, { to: '/jobs', disabled: true }, 'Tâches'));
  assert.match(link, /aria-disabled="true"/u);
  assert.match(link, /tabindex="-1"/u);
  const field = render(
    createElement(Field, {
      label: 'Code',
      name: 'code',
      error: 'Code incorrect',
      help: 'Six chiffres',
      maxLength: 6,
    }),
  );
  assert.match(field, /aria-invalid="true"/u);
  assert.match(field, /aria-describedby=/u);
  assert.match(field, /maxLength="6"/iu);
  assert.ok(!field.includes('minLength'));
  assert.match(render(createElement(Notice, { tone: 'error' }, 'Erreur')), /role="alert"/u);
});

test('SDK UI : Papicons accessibles et décoratives via le catalogue public', () => {
  assert.match(render(createElement(AppIcon, { name: 'notes', label: 'Notes' })), /role="img"/u);
  assert.match(render(createElement(AppIcon, { name: 'documents' })), /aria-hidden="true"/u);
});

test('SDK UI : tables, états et contrôles sans contexte applicatif', async () => {
  const {
    DataTable,
    Th,
    EmptyState,
    StatusPill,
    SearchField,
    Tabs,
    Select,
    CheckField,
    TextArea,
    ConfirmDialog,
  } = await import('../sdk/ui/dist/index.js');
  const table = render(
    createElement(
      DataTable,
      { label: 'Contacts' },
      createElement('thead', null, createElement('tr', null, createElement(Th, null, 'Nom'))),
    ),
  );
  assert.match(table, /role="region" aria-label="Contacts" tabindex="0"/u);
  assert.match(table, /<th scope="col">Nom<\/th>/u);
  assert.doesNotMatch(table, /role="table"/u);
  const tabs = render(
    createElement(Tabs, {
      label: 'Sections',
      items: [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
      value: 'b',
      onChange() {},
    }),
  );
  assert.equal((tabs.match(/aria-current="page"/gu) ?? []).length, 1);
  const select = render(
    createElement(
      Select,
      { label: 'Choix', name: 'choice', error: 'Indisponible', help: 'Choisissez une valeur' },
      createElement('option', { value: 'one' }, 'Un'),
    ),
  );
  assert.match(select, /aria-invalid="true"/u);
  assert.match(select, /aria-describedby="[^"]+-help [^"]+-error"/u);
  assert.match(
    render(createElement(CheckField, { label: 'Archives', checked: true, onChange() {} })),
    /type="checkbox"/u,
  );
  assert.match(
    render(createElement(TextArea, { label: 'Notes', name: 'notes', maxLength: 160 })),
    /<textarea[^>]+maxLength="160"/iu,
  );
  assert.match(render(createElement(StatusPill, { tone: 'positive' }, 'Actif')), /Actif/u);
  assert.match(
    render(createElement(EmptyState, { title: 'Aucune fiche', description: 'Ajoutez une fiche' })),
    /<h2>Aucune fiche<\/h2>/u,
  );
  const search = render(
    createElement(SearchField, {
      label: 'Rechercher',
      value: 'test',
      onChange() {},
      onClear() {},
      clearLabel: 'Effacer',
    }),
  );
  assert.match(search, /type="search"/u);
  assert.match(search, /aria-label="Effacer"/u);
  const dialog = render(
    createElement(ConfirmDialog, {
      open: true,
      title: 'Confirmer',
      message: 'Abandonner ?',
      confirmLabel: 'Continuer',
      cancelLabel: 'Annuler',
      onConfirm() {},
      onCancel() {},
    }),
  );
  assert.match(dialog, /<dialog[^>]+aria-describedby=/u);
  assert.match(dialog, /<button[^>]+autofocus=""[^>]*>Annuler<\/button>/u);
});
