import { createContext, useContext } from 'react';
import type { BusinessDefinition } from '@orkobi/contracts';
import type { PlatformResource } from '../hooks';

export const BusinessCatalogContext = createContext<
  (PlatformResource<{ definitions: BusinessDefinition[] }> & { refresh: () => void }) | null
>(null);

export function useBusinessCatalog() {
  const catalog = useContext(BusinessCatalogContext);
  if (!catalog) throw new Error('BusinessCatalogProvider required.');
  return catalog;
}
