import { Injectable } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { monitorEventLoopDelay } from 'node:perf_hooks';

/** Mesures bornées du processus courant, sans labels de route ou d'identité. */
@Injectable()
export class RuntimeDiagnostics implements OnApplicationShutdown {
  private readonly loop = monitorEventLoopDelay({ resolution: 20 });
  private requests = 0;
  private errors = 0;
  private durationMs = 0;
  private readonly buckets = [0, 0, 0, 0, 0];
  constructor() {
    this.loop.enable();
  }
  record(status: number, duration: number) {
    this.requests++;
    if (status >= 500) this.errors++;
    this.durationMs += duration;
    const bucket = [50, 200, 1000, 4000].findIndex((limit) => duration <= limit);
    this.buckets[bucket < 0 ? 4 : bucket]!++;
  }
  snapshot() {
    const memory = process.memoryUsage();
    return {
      sampledAt: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
      },
      eventLoop: {
        meanMs: Number.isFinite(this.loop.mean) ? Math.round(this.loop.mean / 1e4) / 100 : 0,
        p99Ms: Math.round(this.loop.percentile(99) / 1e4) / 100,
      },
      http: {
        requests: this.requests,
        serverErrors: this.errors,
        meanDurationMs: this.requests ? Math.round(this.durationMs / this.requests) : 0,
        durationBuckets: { boundsMs: [50, 200, 1000, 4000, null], counts: [...this.buckets] },
      },
    };
  }
  onApplicationShutdown() {
    this.loop.disable();
  }
}
