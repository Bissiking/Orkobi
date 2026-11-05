import type { BusinessList, BusinessRecord } from '@orkobi/contracts';
export interface ReferenceSnapshot {
  records: readonly BusinessRecord[];
  cursor: string | null;
  loading: boolean;
  error: boolean;
  loaded: boolean;
}
const empty: ReferenceSnapshot = {
  records: [],
  cursor: null,
  loading: false,
  error: false,
  loaded: false,
};
/** Données de formulaire partagées pendant la visite métier, jamais une décision de droit. */
export class ReferenceStore {
  private entries = new Map<string, ReferenceSnapshot>();
  private listeners = new Map<string, Set<() => void>>();
  private requests = new Map<string, Promise<void>>();
  private generation = 0;
  constructor(private readonly request: (path: string) => Promise<BusinessList>) {}
  snapshot = (path: string) => this.entries.get(path) ?? empty;
  subscribe = (path: string, listener: () => void) => {
    let group = this.listeners.get(path);
    if (!group) {
      group = new Set();
      this.listeners.set(path, group);
    }
    group.add(listener);
    return () => {
      group.delete(listener);
      if (!group.size) this.listeners.delete(path);
    };
  };
  private publish(path: string, value: ReferenceSnapshot) {
    this.entries.set(path, value);
    for (const listener of this.listeners.get(path) ?? []) listener();
  }
  load(path: string, more = false): Promise<void> {
    const active = this.requests.get(path);
    if (active) return active;
    const previous = this.snapshot(path);
    if (!more && previous.loaded && !previous.error) return Promise.resolve();
    const cursor = more ? previous.cursor : null;
    if (more && !cursor) return Promise.resolve();
    const generation = this.generation;
    this.publish(path, { ...previous, loading: true, error: false });
    const promise = Promise.resolve()
      .then(() => this.request(`${path}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`))
      .then((page) => {
        if (generation !== this.generation) return;
        const rows = cursor ? [...previous.records, ...page.records] : page.records;
        this.publish(path, {
          records: [...new Map(rows.map((record) => [record.id, record])).values()],
          cursor: page.nextCursor,
          loading: false,
          error: false,
          loaded: true,
        });
      })
      .catch(() => {
        if (generation === this.generation)
          this.publish(path, { ...previous, loading: false, error: true });
      })
      .finally(() => {
        if (this.requests.get(path) === promise) this.requests.delete(path);
      });
    this.requests.set(path, promise);
    return promise;
  }
  clear() {
    this.generation++;
    this.entries.clear();
    this.requests.clear();
    for (const group of this.listeners.values()) for (const listener of group) listener();
  }
}
