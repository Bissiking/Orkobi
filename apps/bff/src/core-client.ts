import { isCoreHealth } from '@orkobi/contracts';
import type { CoreAvailability } from '@orkobi/contracts';
import type { BffConfig } from './config.js';

/** Unique requête amont autorisée ; aucune URL ou autorisation fournie par le navigateur. */
export async function probeCore(
  config: BffConfig,
  correlationId: string,
  path: '/health' | '/health/ready' = '/health',
): Promise<CoreAvailability> {
  const signal = AbortSignal.timeout(config.coreTimeoutMs);
  try {
    const response = await fetch(new URL(path, config.coreUrl), {
      signal,
      redirect: 'manual',
      headers: { accept: 'application/json', 'x-request-id': correlationId },
    });
    if (
      response.status !== 200 ||
      response.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json'
    ) {
      await response.body?.cancel();
      return { status: 'unavailable', reason: 'invalid_response' };
    }
    const reader = response.body?.getReader();
    if (!reader) return { status: 'unavailable', reason: 'invalid_response' };
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) {
        await reader.cancel();
        return { status: 'unavailable', reason: 'invalid_response' };
      }
      chunks.push(value);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return { status: 'unavailable', reason: 'invalid_response' };
    }
    return isCoreHealth(payload)
      ? { status: 'ok' }
      : { status: 'unavailable', reason: 'invalid_response' };
  } catch {
    return { status: 'unavailable', reason: signal.aborted ? 'timeout' : 'unreachable' };
  }
}
