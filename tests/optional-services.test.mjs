const { performance } = globalThis;
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { TechnicalCache, loadCacheConfig } from '../apps/core/dist/cache/service.js';
import { loadJobConfig } from '../apps/core/dist/jobs/config.js';
import { isModuleManifest } from '../lib/contracts/dist/index.js';
import { demoManifest } from '../modules/demo/dist/index.js';

test('cache mémoire : TTL, copies JSON, éviction, suppression et bornes', async (t) => {
  const cache = new TechnicalCache({ redisUrl: undefined });
  t.after(() => cache.onApplicationShutdown());
  const input = { count: 1 };
  await cache.set('test', 'key', input, 50);
  input.count = 9;
  const result = await cache.get('test', 'key');
  assert.equal(result.count, 1);
  result.count = 3;
  assert.equal((await cache.get('test', 'key')).count, 1);
  await delay(55);
  assert.equal(await cache.get('test', 'key'), undefined);
  for (let i = 0; i < 1001; i++) await cache.set('test', String(i), i, 5000);
  assert.equal(cache.status().entries, 1000);
  assert.equal(await cache.get('test', '0'), undefined);
  await cache.delete('test', '1000');
  assert.equal(await cache.get('test', '1000'), undefined);
  await assert.rejects(cache.set('bad namespace', 'key', {}, 100));
  await assert.rejects(cache.set('test', 'key', {}, 0));
  await assert.rejects(cache.set('test', 'key', 'x'.repeat(65537), 100));
});
test('Redis absent : repli mémoire borné sans ralentir les appels suivants', async (t) => {
  const cache = new TechnicalCache({ redisUrl: 'redis://127.0.0.1:1' });
  t.after(() => cache.onApplicationShutdown());
  const start = performance.now();
  await cache.set('test', 'key', { ok: true }, 5000);
  assert.ok(performance.now() - start < 1500);
  assert.deepEqual(await cache.get('test', 'key'), { ok: true });
  assert.equal(cache.status().mode, 'memory');
});
test('configuration services optionnels et déclaration des tâches refusent les entrées invalides', () => {
  assert.equal(loadJobConfig({}).enabled, true);
  assert.equal(loadCacheConfig({}).redisUrl, undefined);
  for (const env of [{ JOBS_ENABLED: 'yes' }, { JOBS_POLL_MS: '0' }, { JOBS_POLL_MS: '100000' }])
    assert.throws(() => loadJobConfig(env));
  for (const value of ['http://secret', 'redis://', 'secret'])
    assert.throws(
      () => loadCacheConfig({ REDIS_URL: value }),
      (error) => !error.message.includes(value),
    );
  assert.ok(isModuleManifest(demoManifest));
  for (const task of [
    { ...demoManifest.tasks[0], permission: 'other:read' },
    { ...demoManifest.tasks[0], timeoutMs: 0 },
    { ...demoManifest.tasks[0], maxAttempts: 99 },
  ])
    assert.equal(isModuleManifest({ ...demoManifest, tasks: [task] }), false);
});
