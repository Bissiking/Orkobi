import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ConfirmDialog } from '@orkobi/sdk-ui';
import { usePreferences } from '../preferences-context';
import { ConfirmContext } from './confirm-context';
import type { ConfirmFn } from './confirm-context';

/**
 * Dialogue natif de confirmation, en remplacement des `window.confirm`.
 * Une seule instance est montée à la racine ; les appels sont asynchrones.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { locale } = usePreferences();
  const fr = locale === 'fr';
  const [request, setRequest] = useState<{
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    resolve: (ok: boolean) => void;
  } | null>(null);
  const pending = useRef<((ok: boolean) => void) | null>(null);
  const confirm = useCallback<ConfirmFn>(
    (message, options) =>
      new Promise<boolean>((resolve) => {
        if (pending.current) {
          resolve(false);
          return;
        }
        pending.current = resolve;
        setRequest({ message, ...options, resolve });
      }),
    [],
  );
  useEffect(
    () => () => {
      pending.current?.(false);
      pending.current = null;
    },
    [],
  );
  const settle = (ok: boolean) => {
    const current = request;
    setRequest(null);
    pending.current = null;
    current?.resolve(ok);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={!!request}
        title={fr ? 'Confirmer' : 'Confirm'}
        message={request?.message ?? ''}
        confirmLabel={request?.confirmLabel ?? (fr ? 'Confirmer' : 'Confirm')}
        cancelLabel={fr ? 'Annuler' : 'Cancel'}
        danger={request?.danger ?? false}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
}
