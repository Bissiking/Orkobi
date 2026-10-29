import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { isBffBootstrap } from '@orkobi/contracts';
import { BootstrapContext as Context } from './bootstrap-context';
import type { BootstrapState } from './bootstrap-context';

export function BootstrapProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<BootstrapState, 'refresh'>>({
    loading: true,
    data: null,
    error: false,
  });
  const current = useRef<AbortController | null>(null);
  const refresh = useCallback(() => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    setState((previous) => ({ ...previous, loading: true, error: false }));
    void (async () => {
      try {
        const response = await fetch('/api/bootstrap', {
          headers: { accept: 'application/json' },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
        });
        if (!response.ok) throw new Error('BFF unavailable');
        const data: unknown = await response.json();
        if (!isBffBootstrap(data)) throw new Error('Invalid BFF contract');
        if (!controller.signal.aborted) setState({ loading: false, data, error: false });
      } catch {
        if (!controller.signal.aborted) setState({ loading: false, data: null, error: true });
      }
    })();
  }, []);
  useEffect(() => {
    refresh();
    return () => current.current?.abort();
  }, [refresh]);
  return <Context value={{ ...state, refresh }}>{children}</Context>;
}
