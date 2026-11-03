import { createHash } from 'node:crypto';
import { createClient } from '@redis/client';
import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';

export interface CacheConfig {
  readonly redisUrl: string | undefined;
}
export const CACHE_CONFIG = Symbol('CACHE_CONFIG');
export function loadCacheConfig(env: NodeJS.ProcessEnv): CacheConfig {
  const value = env.REDIS_URL;
  if (!value) return Object.freeze({ redisUrl: undefined });
  try {
    const url = new URL(value);
    if (!['redis:', 'rediss:'].includes(url.protocol) || !url.hostname || url.hash)
      throw new Error();
  } catch {
    throw new Error('REDIS_URL doit être une URL redis ou rediss.');
  }
  return Object.freeze({ redisUrl: value });
}

/** Cache technique jetable : jamais source d'autorisation, de session ou de file durable. */
@Injectable()
export class TechnicalCache implements OnApplicationShutdown {
  private readonly memory = new Map<string, { value: string; expires: number }>();
  private readonly redis: ReturnType<typeof createClient> | undefined;
  private connecting: Promise<void> | undefined;
  private retryAfter = 0;
  private closed = false;
  private readonly metrics = { hits: 0, misses: 0, errors: 0, writes: 0 };
  constructor(@Inject(CACHE_CONFIG) config: CacheConfig) {
    if (config.redisUrl) {
      this.redis = createClient({
        url: config.redisUrl,
        disableOfflineQueue: true,
        socket: { connectTimeout: 300, reconnectStrategy: false },
        commandsQueueMaxLength: 100,
      });
      this.redis.on('error', () => {
        this.metrics.errors++;
      });
    }
  }
  status() {
    return {
      mode: this.redis?.isReady ? 'redis' : 'memory',
      redisConfigured: !!this.redis,
      entries: this.memory.size,
      ...this.metrics,
    };
  }
  private async client() {
    if (this.closed || !this.redis) return undefined;
    if (this.redis.isReady) return this.redis;
    if (Date.now() < this.retryAfter) return undefined;
    if (!this.connecting)
      this.connecting = this.command(() => this.redis!.connect())
        .then(() => {})
        .catch(() => {
          this.retryAfter = Date.now() + 5000;
        })
        .finally(() => {
          this.connecting = undefined;
        });
    await this.connecting;
    return this.redis.isReady ? this.redis : undefined;
  }
  private key(namespace: string, key: string) {
    if (!/^[a-z][a-z0-9.:-]{0,79}$/u.test(namespace) || key.length > 512)
      throw new TypeError('Invalid cache key.');
    return `orkobi:cache:${namespace}:${createHash('sha256').update(key).digest('hex')}`;
  }
  private async command<T>(operation: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            if (this.redis?.isOpen) this.redis.destroy();
            this.retryAfter = Date.now() + 5000;
            reject(new Error('Cache timeout.'));
          }, 300);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async get<T>(namespace: string, key: string): Promise<T | undefined> {
    const cacheKey = this.key(namespace, key),
      client = await this.client();
    let raw: string | undefined;
    if (client) {
      try {
        raw = (await this.command(() => client.get(cacheKey))) ?? undefined;
      } catch {
        this.metrics.errors++;
      }
    } else {
      const entry = this.memory.get(cacheKey);
      if (entry && entry.expires > Date.now()) {
        raw = entry.value;
        this.memory.delete(cacheKey);
        this.memory.set(cacheKey, entry);
      } else this.memory.delete(cacheKey);
    }
    if (raw === undefined) {
      this.metrics.misses++;
      return undefined;
    }
    try {
      const value = JSON.parse(raw) as T;
      this.metrics.hits++;
      return value;
    } catch {
      this.metrics.misses++;
      return undefined;
    }
  }
  async set(namespace: string, key: string, value: unknown, ttlMs: number): Promise<void> {
    if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 3600000)
      throw new TypeError('Invalid cache TTL.');
    const cacheKey = this.key(namespace, key),
      raw = JSON.stringify(value);
    if (raw === undefined || Buffer.byteLength(raw) > 65536)
      throw new TypeError('Cache value too large.');
    const client = await this.client();
    if (client) {
      try {
        await this.command(() => client.set(cacheKey, raw, { PX: ttlMs }));
        this.memory.delete(cacheKey);
        this.metrics.writes++;
        return;
      } catch {
        this.metrics.errors++;
      }
    }
    this.memory.delete(cacheKey);
    // Enlever les expirations avant d'évincer la plus ancienne valeur.
    for (const [id, entry] of this.memory) if (entry.expires <= Date.now()) this.memory.delete(id);
    if (this.memory.size >= 1000) this.memory.delete(this.memory.keys().next().value!);
    this.memory.set(cacheKey, { value: raw, expires: Date.now() + ttlMs });
    this.metrics.writes++;
  }
  async delete(namespace: string, key: string) {
    const cacheKey = this.key(namespace, key);
    this.memory.delete(cacheKey);
    const client = await this.client();
    if (client)
      try {
        await this.command(() => client.del(cacheKey));
      } catch {
        this.metrics.errors++;
      }
  }
  async onApplicationShutdown() {
    this.closed = true;
    await this.connecting;
    if (this.redis?.isOpen) this.redis.destroy();
    this.memory.clear();
  }
}
