import { createContext, useContext } from 'react';

export interface ConfirmOptions {
  confirmLabel?: string;
  danger?: boolean;
}
export type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;

export const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used within ConfirmProvider');
  return confirm;
}
