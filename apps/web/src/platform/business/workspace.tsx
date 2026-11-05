import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import type { BusinessList, ModuleSummary } from '@orkobi/contracts';
import { usePlatform } from '../context';
import { usePlatformResource } from '../hooks';
import { platformRequest } from '../api';
import { ReferenceStore } from './reference-store';
import { useBusinessCatalog } from './catalog-context';
import { BusinessWorkspaceContext } from './workspace-context';
export function BusinessWorkspace({ children }: { children: ReactNode }) {
  const { session } = usePlatform(),
    { pathname } = useLocation();
  const [revision, setRevision] = useState(0),
    [references] = useState(
      () => new ReferenceStore((path) => platformRequest<BusinessList>(path)),
    );
  const [flash, setFlash] = useState<{ path: string; text: string } | null>(null);
  const org = session.organizations.find((org) => org.id === session.activeOrganizationId);
  const catalog = useBusinessCatalog();
  const modules = usePlatformResource<{ modules: ModuleSummary[] }>(
    org?.permissions.includes('modules:read') ? 'modules' : null,
    revision,
  );
  useEffect(() => {
    setFlash((current) => (current && current.path !== pathname ? null : current));
  }, [pathname]);
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 6000);
    return () => window.clearTimeout(timer);
  }, [flash]);
  const refresh = () => {
    references.clear();
    catalog.refresh();
    setRevision((value) => value + 1);
  };
  return (
    <BusinessWorkspaceContext
      value={{
        definitions: catalog.data?.definitions ?? [],
        modules: modules.data?.modules ?? null,
        loading: catalog.loading || modules.loading,
        error: catalog.error || modules.error,
        refresh,
        references,
        flash,
        notify: (path, text) => setFlash({ path, text }),
        dismiss: () => setFlash(null),
      }}
    >
      {children}
    </BusinessWorkspaceContext>
  );
}
