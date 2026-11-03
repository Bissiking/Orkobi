const { performance } = globalThis;
import { URL } from 'node:url';
import assert from 'node:assert/strict';
import process from 'node:process';
import { test } from 'node:test';
import { createRequire } from 'node:module';
const { createClient } = createRequire(new URL('../apps/core/package.json', import.meta.url))(
  '@redis/client',
);
import { TechnicalCache } from '../apps/core/dist/cache/service.js';
assert.ok(process.env.TEST_REDIS_URL, 'TEST_REDIS_URL requis, Redis de test seulement.');
test('Redis réel : TTL, partage entre processus, suppression et repli après panne', async (t) => {
  const url = process.env.TEST_REDIS_URL,
    first = new TechnicalCache({ redisUrl: url }),
    second = new TechnicalCache({ redisUrl: url });
  const control = createClient({ url });
  control.on('error', () => {});
  await control.connect();
  t.after(async () => {
    await first.onApplicationShutdown();
    await second.onApplicationShutdown();
    if (control.isOpen) control.destroy();
  });
  await first.set('integration', 'shared', { version: 1 }, 5000);
  assert.deepEqual(await second.get('integration', 'shared'), { version: 1 });
  assert.equal(first.status().mode, 'redis');
  await second.delete('integration', 'shared');
  assert.equal(await first.get('integration', 'shared'), undefined);
  // CLIENT PAUSE ne touche que le Redis jetable ; force un timeout de commande et la destruction du socket.
  await control.sendCommand(['CLIENT', 'PAUSE', '700', 'ALL']);
  const start = performance.now();
  await first.set('integration', 'fallback', 42, 5000);
  assert.ok(performance.now() - start < 1500);
  assert.equal(first.status().mode, 'memory');
  assert.equal(await first.get('integration', 'fallback'), 42);
});
