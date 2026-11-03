import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { TechnicalCache } from '../apps/core/dist/cache/service.js';
import { PostgreSqlDatabase, loadDatabaseConfig } from '../lib/database/dist/index.js';
const cache = new TechnicalCache({ redisUrl: process.env.REDIS_URL || undefined });
const database = process.env.DB_PASSWORD
  ? new PostgreSqlDatabase(loadDatabaseConfig({ ...process.env, DB_ENABLED: 'true' }))
  : undefined;
async function measure(name, count, operation) {
  const samples = [];
  for (let index = 0; index < count; index++) {
    const start = performance.now();
    await operation(index);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return {
    name,
    samples: count,
    p50Ms: +samples[Math.floor(count * 0.5)].toFixed(3),
    p95Ms: +samples[Math.floor(count * 0.95)].toFixed(3),
    p99Ms: +samples[Math.floor(count * 0.99)].toFixed(3),
  };
}
try {
  const results = [];
  results.push(
    await measure('cache_set', 1000, (index) =>
      cache.set('benchmark', String(index), { index }, 60000),
    ),
  );
  results.push(await measure('cache_get', 1000, (index) => cache.get('benchmark', String(index))));
  if (database) {
    results.push(await measure('sql_readiness', 100, () => database.isReady()));
    results.push(
      await measure('sql_transaction', 100, () =>
        database.platform.transaction((repo) => repo.initialized()),
      ),
    );
  }
  process.stdout.write(
    JSON.stringify(
      {
        node: process.version,
        cache: cache.status(),
        results,
        scope: 'Sequential local microbenchmark; not a production capacity test.',
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await cache.onApplicationShutdown();
  await database?.close();
}
