import { useEffect, useSyncExternalStore } from 'react';
import { useBusinessWorkspace } from './workspace-context';
export function useReference(module: string, entity: string) {
  const { references } = useBusinessWorkspace(),
    path = `business/${module}/${entity}`;
  const snapshot = useSyncExternalStore(
    (listener) => references.subscribe(path, listener),
    () => references.snapshot(path),
  );
  useEffect(() => {
    if (!snapshot.loaded && !snapshot.error) void references.load(path);
  }, [references, path, snapshot.loaded, snapshot.error]);
  return {
    ...snapshot,
    more: () => references.load(path, true),
    retry: () => references.load(path, !!snapshot.records.length && !!snapshot.cursor),
  };
}
