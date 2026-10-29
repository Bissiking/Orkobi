import { createContext, useContext } from 'react';
import type { BffBootstrap } from '@orkobi/contracts';

export interface BootstrapState {
  readonly loading: boolean;
  readonly data: BffBootstrap | null;
  readonly error: boolean;
  readonly refresh: () => void;
}
export const BootstrapContext = createContext<BootstrapState | null>(null);
export function useBootstrap() {
  const value = useContext(BootstrapContext);
  if (!value) throw new Error('BootstrapProvider required.');
  return value;
}
