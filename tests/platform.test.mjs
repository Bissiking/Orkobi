import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, verifyPassword } from '../apps/core/dist/platform/password.js';
import { loadConfig, ConfigurationError } from '../apps/core/dist/config.js';

test('mots de passe : scrypt salé et vérification constante du résultat', async () => {
  const hash = await hashPassword('A unique long passphrase');
  assert.ok(!hash.includes('passphrase'));
  assert.equal(await verifyPassword('A unique long passphrase', hash), true);
  assert.equal(await verifyPassword('incorrect', hash), false);
  assert.equal(await verifyPassword('test', 'invalid'), false);
});
test('configuration identité : cookies sécurisés en production et secrets invalides expurgés', () => {
  assert.equal(loadConfig({ NODE_ENV: 'production' }).platform.secureCookies, true);
  for (const env of [{ SETUP_TOKEN: 'secret-test' }, { SESSION_SECURE: 'secret-test' }]) {
    assert.throws(
      () => loadConfig(env),
      (error) => error instanceof ConfigurationError && !error.message.includes('secret-test'),
    );
  }
});
