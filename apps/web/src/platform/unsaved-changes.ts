import { useCallback, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router';
import { usePreferences } from '../preferences-context';
import { useConfirm } from './confirm-context';

type ContextChangeEvent = Event & { confirmations: Promise<boolean>[] };
/** Garde locale ; elle ne décide jamais des droits ou du contexte serveur. */
export function useUnsavedChanges(dirty: boolean, pending = false) {
  const { locale } = usePreferences(),
    confirm = useConfirm(),
    state = useRef({ dirty, pending, allowed: false });
  state.current.dirty = dirty;
  state.current.pending = pending;
  useEffect(() => {
    if (dirty) state.current.allowed = false;
  }, [dirty]);
  const allow = useCallback(() => {
    state.current.allowed = true;
  }, []);
  const confirmLeave = useCallback(async () => {
    const current = state.current;
    if (current.pending) return false;
    if (!current.dirty || current.allowed) return true;
    const accepted = await confirm(
      locale === 'fr'
        ? 'Quitter sans enregistrer vos modifications ?'
        : 'Leave without saving your changes?',
      { danger: true },
    );
    // Un changement de contexte ne doit pas autoriser un abandon pendant une écriture.
    if (!accepted || state.current.pending) return false;
    state.current.allowed = true;
    return true;
  }, [locale, confirm]);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !state.current.allowed &&
      (state.current.dirty || state.current.pending) &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
  const resolving = useRef(false);
  useEffect(() => {
    if (blocker.state !== 'blocked' || resolving.current) return;
    resolving.current = true;
    void confirmLeave()
      .then((accepted) => {
        if (accepted) blocker.proceed();
        else blocker.reset();
      })
      .finally(() => {
        resolving.current = false;
      });
  }, [blocker, confirmLeave]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!state.current.allowed && (state.current.dirty || state.current.pending)) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const beforeContext = (event: Event) => {
      (event as ContextChangeEvent).confirmations.push(confirmLeave());
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('orkobi:before-context-change', beforeContext);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('orkobi:before-context-change', beforeContext);
    };
  }, [confirmLeave]);
  return { confirmLeave, allow };
}
export async function confirmContextChange() {
  const event = Object.assign(new Event('orkobi:before-context-change'), {
    confirmations: [] as Promise<boolean>[],
  });
  window.dispatchEvent(event);
  return (await Promise.all(event.confirmations)).every(Boolean);
}
