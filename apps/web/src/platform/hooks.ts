import { useEffect, useState } from 'react';
import { usePreferences } from '../preferences-context';
import { platformCopy } from './copy';
import { platformRequest, PlatformApiError } from './api';
export function usePlatformCopy() {
  return platformCopy[usePreferences().locale];
}
export function usePlatformResource<T>(path: string | null, revision = 0) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState<false | string>(false),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setData(null);
    setError(false);
    setLoading(true);
    if (!path) {
      setLoading(false);
      return;
    }
    void platformRequest<T>(path)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((failure: unknown) => {
        if (active) setError(failure instanceof PlatformApiError ? failure.code : 'unknown');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, revision]);
  return { data, error, loading };
}
