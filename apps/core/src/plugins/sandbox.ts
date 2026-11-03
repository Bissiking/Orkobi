import type { TaskSignal } from '@orkobi/sdk-core';
import { Worker } from 'node:worker_threads';
export class PluginExecutionError extends Error {
  constructor(readonly reason: 'failed' | 'timeout' | 'unavailable' = 'failed') {
    super('Exécution du plugin refusée.');
  }
}
/** Deux moteurs distincts : worker hôte jetable, JS tiers uniquement dans QuickJS/WASM. */
export function runPlugin(
  options: {
    code: string;
    handler: string | null;
    handlers: string[];
    context: unknown;
    input: unknown;
    timeoutMs: number;
    signal?: TaskSignal;
  },
  broker: (operation: string, args: unknown, signal: AbortSignal) => Promise<unknown>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    if (options.signal?.aborted) {
      reject(new PluginExecutionError());
      return;
    }
    const worker = new Worker(new URL('./sandbox-worker.js', import.meta.url), {
      workerData: { ...options, signal: undefined },
      env: {},
      execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 64, stackSizeMb: 2 },
    });
    let finished = false,
      calls = 0,
      inFlight = false;
    const settle = (error?: Error, value?: unknown) => {
      if (finished) return;
      finished = true;
      controller.abort();
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      void worker.terminate();
      if (error) reject(error);
      else resolve(value);
    };
    const abort = () => settle(new PluginExecutionError());
    const timer = setTimeout(
      () => settle(new PluginExecutionError('timeout')),
      options.timeoutMs + 1000,
    );
    options.signal?.addEventListener('abort', abort, { once: true });
    worker.on('error', () => settle(new PluginExecutionError()));
    worker.on('exit', () => {
      if (!finished) settle(new PluginExecutionError());
    });
    worker.on(
      'message',
      (message: {
        done?: boolean;
        failed?: boolean;
        json?: string;
        id?: number;
        operation?: string;
      }) => {
        if (finished) return;
        if (message.failed) {
          settle(new PluginExecutionError());
          return;
        }
        if (message.done) {
          try {
            settle(undefined, JSON.parse(message.json!));
          } catch {
            settle(new PluginExecutionError());
          }
          return;
        }
        if (
          ++calls > 100 ||
          inFlight ||
          typeof message.operation !== 'string' ||
          typeof message.json !== 'string' ||
          message.json.length > 16384
        ) {
          settle(new PluginExecutionError());
          return;
        }
        inFlight = true;
        void Promise.resolve()
          .then(() => {
            if (finished) throw new PluginExecutionError();
            return broker(message.operation!, JSON.parse(message.json!), controller.signal);
          })
          .then((value) => {
            if (finished) return;
            const result = JSON.stringify(value);
            if (result.length > 65536) {
              settle(new PluginExecutionError());
              return;
            }
            worker.postMessage({ id: message.id, result });
          })
          .catch(() => {
            if (!finished)
              worker.postMessage({
                id: message.id,
                result: JSON.stringify({
                  ok: false,
                  error: { code: 'forbidden', message: 'Opération refusée.' },
                }),
              });
          })
          .finally(() => {
            inFlight = false;
          });
      },
    );
  });
}
