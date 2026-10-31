import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApplication } from '../apps/core/dist/application.js';
import { loadConfig } from '../apps/core/dist/config.js';
import { JsonLogger } from '../apps/core/dist/logger.js';
import {
  CORE_CAPABILITIES,
  CORE_IDENTITY,
  CORE_ORGANIZATIONS,
  CORE_PERMISSIONS,
} from '../apps/core/dist/services/contracts.js';
import { CoreSdkFactory } from '../apps/core/dist/services/sdk-factory.js';

test('services Core : injection Nest et indisponibilité explicite sans SQL', async (t) => {
  const app = await createApplication(loadConfig({ NODE_ENV: 'test' }), new JsonLogger(() => {}));
  t.after(() => app.close());
  await app.init();
  const context = { userId: 'user-a', organizationId: 'org-a', correlationId: 'request-a' };
  const sdk = app.get(CoreSdkFactory).forAuthorizedContext(context);
  const unavailable = {
    ok: false,
    error: {
      code: 'unavailable',
      message: 'Service du Core non implémenté.',
      correlationId: 'request-a',
    },
  };
  for (const result of await Promise.all([
    app.get(CORE_IDENTITY).currentUser(context),
    app.get(CORE_ORGANIZATIONS).currentOrganization(context),
    app.get(CORE_PERMISSIONS).can(context, 'contacts:read'),
    sdk.identity.currentUser(),
    sdk.identity.currentOrganization(),
    sdk.permissions.can('contacts:read'),
  ])) {
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'unavailable');
    assert.equal(result.error.correlationId, unavailable.error.correlationId);
  }
  // Le registre de capabilities répond sans SQL : la capability est absente, le service non.
  for (const result of await Promise.all([
    app.get(CORE_CAPABILITIES).has(context, 'core.identity'),
    sdk.capabilities.has('core.identity'),
  ]))
    assert.deepEqual(result, { ok: true, value: false });
  const withoutCorrelation = app.get(CoreSdkFactory).forAuthorizedContext({
    userId: 'user-a',
    organizationId: 'org-a',
  });
  const result = await withoutCorrelation.identity.currentUser();
  assert.equal(result.ok, false);
  assert.equal(Object.hasOwn(result.error, 'correlationId'), false);
});

test('SDK Core : contextes distincts, copie immuable et délégation de chaque appel', async () => {
  const calls = [];
  let allowed = true;
  const factory = new CoreSdkFactory(
    {
      async currentUser(context) {
        calls.push(['user', context]);
        return { ok: true, value: { id: context.userId, displayName: 'Test' } };
      },
    },
    {
      async currentOrganization(context) {
        calls.push(['organization', context]);
        return { ok: true, value: { id: context.organizationId, name: 'Test' } };
      },
    },
    {
      async can(context, permission) {
        calls.push(['permission', context, permission]);
        return { ok: true, value: allowed };
      },
    },
    {
      async has(context, capability) {
        calls.push(['capability', context, capability]);
        return { ok: true, value: true };
      },
    },
  );
  const original = { userId: 'user-a', organizationId: 'org-a', correlationId: 'request-a' };
  const sdkA = factory.forAuthorizedContext(original);
  original.organizationId = 'org-b';
  const sdkB = factory.forAuthorizedContext(original);
  for (const value of [sdkA, sdkA.context, sdkA.identity, sdkA.permissions, sdkA.capabilities]) {
    assert.ok(Object.isFrozen(value));
  }
  assert.throws(() => {
    sdkA.context.organizationId = 'org-b';
  }, TypeError);
  assert.throws(() => {
    sdkA.permissions = sdkB.permissions;
  }, TypeError);
  assert.equal((await sdkA.identity.currentUser()).value.id, 'user-a');
  assert.equal((await sdkA.identity.currentOrganization()).value.id, 'org-a');
  assert.equal((await sdkB.identity.currentOrganization()).value.id, 'org-b');
  assert.deepEqual(await sdkA.permissions.can('contacts:read'), { ok: true, value: true });
  allowed = false;
  assert.deepEqual(await sdkA.permissions.can('contacts:read'), { ok: true, value: false });
  assert.deepEqual(await sdkA.capabilities.has('core.identity'), { ok: true, value: true });
  assert.deepEqual(
    calls.map(([operation, context, key]) => [operation, context.organizationId, key]),
    [
      ['user', 'org-a', undefined],
      ['organization', 'org-a', undefined],
      ['organization', 'org-b', undefined],
      ['permission', 'org-a', 'contacts:read'],
      ['permission', 'org-a', 'contacts:read'],
      ['capability', 'org-a', 'core.identity'],
    ],
  );
  assert.ok(calls.every(([, context]) => context.correlationId === 'request-a'));
});

test('SDK Core : préserve les erreurs métier et laisse les erreurs de programmation rejeter la promesse', async () => {
  const failure = { ok: false, error: { code: 'forbidden', message: 'Accès refusé.' } };
  const unexpected = new Error('service failure');
  const factory = new CoreSdkFactory(
    { currentUser: async () => failure },
    { currentOrganization: async () => failure },
    { can: async () => failure },
    {
      has: async () => {
        throw unexpected;
      },
    },
  );
  const sdk = factory.forAuthorizedContext({ userId: 'user-a', organizationId: 'org-a' });
  assert.equal(await sdk.identity.currentUser(), failure);
  assert.equal(await sdk.identity.currentOrganization(), failure);
  assert.equal(await sdk.permissions.can('contacts:read'), failure);
  await assert.rejects(sdk.capabilities.has('core.identity'), (error) => error === unexpected);
});
