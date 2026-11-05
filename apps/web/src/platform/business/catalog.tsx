import { useState } from 'react';
import type { ReactNode } from 'react';
import type { BusinessDefinition } from '@orkobi/contracts';
import { usePlatform } from '../context';
import { usePlatformResource } from '../hooks';
import { BusinessCatalogContext } from './catalog-context';

/** Déclarations uniquement : les permissions et les sessions ne sont jamais mises en cache. */
export function BusinessCatalogProvider({ children }: { children: ReactNode }) {
  const { session } = usePlatform();
  const [revision, setRevision] = useState(0);
  const catalog = usePlatformResource<{ definitions: BusinessDefinition[] }>(
    session.user ? 'business' : null,
    revision,
  );
  return (
    <BusinessCatalogContext value={{ ...catalog, refresh: () => setRevision((n) => n + 1) }}>
      {children}
    </BusinessCatalogContext>
  );
}
