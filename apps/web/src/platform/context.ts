import { createContext, useContext } from 'react';
import type { InstallationStatus, PlatformSession } from '@orkobi/contracts';
export interface PlatformState {
  loading: boolean;
  error: boolean;
  status: InstallationStatus | null;
  session: PlatformSession;
  refresh: () => Promise<void>;
  post: <T = unknown>(path: string, body: unknown) => Promise<T>;
}
export const PlatformContext = createContext<PlatformState | null>(null);
export function usePlatform() {
  const value = useContext(PlatformContext);
  if (!value) throw new Error('PlatformProvider required.');
  return value;
}
