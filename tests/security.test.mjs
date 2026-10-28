// tests/security.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { pathToFileURL, URL } from 'node:url';

const require = createRequire(new URL('../lib/security/package.json', import.meta.url));
const { evaluateAuthorization } = await import(pathToFileURL(require.resolve('@orkobi/security')).href);
const context = { organizationId: 'org-a', userId: 'user-a' };
const request = { context, permission: 'contacts:read' };
const membership = {
  id: 'member-a', ...context, status: 'active', roleIds: ['reader'],
};
const role = {
  id: 'reader', organizationId: 'org-a', name: 'Lecteur', permissions: ['contacts:read'],
};

test('refus par défaut sans appartenance ou sans rôle', () => {
  assert.deepEqual(evaluateAuthorization(request, [], [role]), {
    allowed: false, reason: 'no_active_membership',
  });
  assert.deepEqual(evaluateAuthorization(request, [membership], []), {
    allowed: false, reason: 'permission_denied',
  });
});

test('accord pour une permission explicite dans la bonne organisation', () => {
  assert.deepEqual(evaluateAuthorization(request, [membership], [role]), { allowed: true });
});

test('refus des appartenances suspendues, des autres utilisateurs et organisations', () => {
  for (const change of [
    { status: 'suspended' }, { userId: 'user-b' }, { organizationId: 'org-b' },
  ]) {
    assert.equal(evaluateAuthorization(request, [{ ...membership, ...change }], [role]).allowed, false);
  }
});

test('un rôle de même identifiant dans une autre organisation ne donne aucun droit', () => {
  assert.equal(evaluateAuthorization(request, [membership], [
    { ...role, organizationId: 'org-b' },
  ]).allowed, false);
});

test('aucun droit implicite, wildcard ou rôle non attribué', () => {
  for (const changedRole of [
    { ...role, permissions: ['contacts:*'] },
    { ...role, permissions: ['contacts:write'] },
    { ...role, id: 'admin' },
  ]) {
    assert.equal(evaluateAuthorization(request, [membership], [changedRole]).allowed, false);
  }
});

test('les droits ne débordent pas lors du changement d’organisation', () => {
  const otherRequest = { ...request, context: { ...context, organizationId: 'org-b' } };
  assert.equal(evaluateAuthorization(otherRequest, [membership], [role]).allowed, false);
});
