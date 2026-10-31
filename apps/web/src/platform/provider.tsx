import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { InstallationStatus, PlatformSession } from '@orkobi/contracts';
import { PlatformContext } from './context';
import { platformRequest, PlatformApiError } from './api';

const anonymous: PlatformSession = {
  user: null,
  csrfToken: null,
  activeOrganizationId: null,
  organizations: [],
};
export function PlatformProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(false);
  const [status, setStatus] = useState<InstallationStatus | null>(null);
  const [session, setSession] = useState<PlatformSession>(anonymous);
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++revision.current;
    try {
      const next = await platformRequest<InstallationStatus>('status');
      if (
        typeof next?.initialized !== 'boolean' ||
        typeof next.databaseReady !== 'boolean' ||
        typeof next.modulesReady !== 'boolean'
      )
        throw new Error();
      const auth =
        next.initialized && next.databaseReady
          ? await platformRequest<PlatformSession>('session')
          : anonymous;
      if (
        !auth ||
        !Array.isArray(auth.organizations) ||
        (auth.user !== null && typeof auth.user?.id !== 'string')
      )
        throw new Error();
      if (current === revision.current) {
        setStatus(next);
        setSession(auth);
        setError(false);
      }
    } catch {
      if (current === revision.current) {
        setError(true);
        setSession(anonymous);
      }
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }, []);
  const post = useCallback(
    async <T,>(path: string, body: unknown) => {
      try {
        return await platformRequest<T>(path, body, session.csrfToken);
      } catch (error) {
        if (error instanceof PlatformApiError && error.code === 'unauthenticated')
          setSession(anonymous);
        throw error;
      }
    },
    [session.csrfToken],
  );
  useEffect(() => {
    void refresh();
    return () => {
      revision.current++;
    };
  }, [refresh]);
  useEffect(() => {
    const expired = () => setSession(anonymous);
    window.addEventListener('orkobi:unauthenticated', expired);
    return () => window.removeEventListener('orkobi:unauthenticated', expired);
  }, []);
  return (
    <PlatformContext value={{ loading, error, status, session, refresh, post }}>
      {children}
    </PlatformContext>
  );
}
