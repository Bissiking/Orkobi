import { useEffect, useState } from 'react';
import { usePreferences } from '../preferences-context';
import { errorCode } from '../errors';
import { platformCopy } from './copy';
import { platformRequest } from './api';
export function usePlatformCopy() {
  return platformCopy[usePreferences().locale];
}
export interface PlatformResource<T> {
  data: T | null;
  error: false | string;
  /** Aucune donnée à afficher pour le chemin courant. */
  loading: boolean;
  /** Revalidation en cours sur des données déjà affichées (stale-while-revalidate). */
  refreshing: boolean;
}
/**
 * Charge une ressource plateforme. Un changement de chemin vide l'état ;
 * un changement de révision conserve les données affichées pendant la
 * revalidation afin d'éviter tout clignotement de l'écran.
 */
export function usePlatformResource<T>(path: string | null, revision = 0): PlatformResource<T> {
  const [state, setState] = useState<{
    path: string | null;
    revision: number;
    data: T | null;
    error: false | string;
    fetching: boolean;
  }>({ path: null, revision: -1, data: null, error: false, fetching: false });
  useEffect(() => {
    const controller = new AbortController();
    if (!path) {
      setState({ path, revision, data: null, error: false, fetching: false });
      return;
    }
    setState((current) => ({
      path,
      revision,
      data: current.path === path ? current.data : null,
      error: false,
      fetching: true,
    }));
    void platformRequest<T>(path, undefined, undefined, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ path, revision, data, error: false, fetching: false });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState((current) => ({
            path,
            revision,
            data: current.path === path ? current.data : null,
            error: errorCode(error),
            fetching: false,
          }));
      });
    return () => controller.abort();
  }, [path, revision]);
  // Ne jamais rendre la donnée de l'ancienne URL avant le nettoyage de l'effet.
  if (state.path !== path)
    return { data: null, error: false as const, loading: !!path, refreshing: false };
  if (state.revision !== revision)
    return {
      data: state.data,
      error: false as const,
      loading: !!path && state.data === null,
      refreshing: !!path && state.data !== null,
    };
  return {
    data: state.data,
    error: state.error,
    loading: state.fetching && state.data === null,
    refreshing: state.fetching && state.data !== null,
  };
}
