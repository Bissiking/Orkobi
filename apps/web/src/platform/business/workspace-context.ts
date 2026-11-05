import { createContext, useContext } from 'react';
import type { BusinessDefinition, ModuleSummary } from '@orkobi/contracts';
import type { ReferenceStore } from './reference-store';
export interface BusinessWorkspaceState {
  definitions: readonly BusinessDefinition[];
  modules: readonly ModuleSummary[] | null;
  loading: boolean;
  error: false | string;
  refresh: () => void;
  references: ReferenceStore;
  flash: { path: string; text: string } | null;
  notify: (path: string, text: string) => void;
  dismiss: () => void;
}
export const BusinessWorkspaceContext = createContext<BusinessWorkspaceState | null>(null);
export function useBusinessWorkspace() {
  const value = useContext(BusinessWorkspaceContext);
  if (!value) throw new Error('BusinessWorkspace required.');
  return value;
}
