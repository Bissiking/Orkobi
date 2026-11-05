import { useRef, useState } from 'react';
import type { BusinessProblem, BusinessRecord } from '@orkobi/contracts';
import { usePlatform } from '../context';
import { PlatformApiError } from '../api';
export interface BusinessFailure {
  reason?: BusinessProblem;
  field?: string;
}
export function useBusinessMutation() {
  const { post } = usePlatform(),
    key = useRef(crypto.randomUUID()),
    busy = useRef(false);
  const [pending, setPending] = useState(false),
    [error, setError] = useState<BusinessFailure | null>(null);
  const run = async (path: string, body: Record<string, unknown>) => {
    if (busy.current) return null;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await post<{ record: BusinessRecord }>(path, {
        ...body,
        idempotencyKey: key.current,
      });
      key.current = crypto.randomUUID();
      return result.record;
    } catch (error) {
      setError(
        error instanceof PlatformApiError
          ? {
              ...(error.reason ? { reason: error.reason } : {}),
              ...(error.field ? { field: error.field } : {}),
            }
          : {},
      );
      return null;
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  return { pending, error, run };
}
