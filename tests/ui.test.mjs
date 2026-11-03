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
