import { DependencyList, useCallback, useEffect, useRef, useState } from 'react';
import type { PageMeta } from '../api/types';

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const run = useCallback(() => {
    let alive = true;
    setState(s => ({ ...s, loading: true, error: undefined }));
    fn()
      .then(data => alive && setState({ data, loading: false }))
      .catch(e => alive && setState({ loading: false, error: e instanceof Error ? e.message : 'Failed to load' }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(run, [run]);
  return { ...state, reload: run };
}

/** Infinite-scroll helper for the paginated catalog endpoints. Resets whenever `deps` change. */
export function usePaginated<T>(fetchPage: (page: number) => Promise<{ items: T[]; meta: PageMeta }>, deps: DependencyList) {
  const [items, setItems] = useState<T[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const gen = useRef(0);

  const load = useCallback(
    (page: number) => {
      const my = ++gen.current;
      setLoading(true);
      setError(undefined);
      fetchPage(page)
        .then(r => {
          if (my !== gen.current) return;
          setItems(prev => (page === 1 ? r.items : [...prev, ...r.items]));
          setMeta(r.meta);
          setLoading(false);
        })
        .catch(e => {
          if (my !== gen.current) return;
          setError(e instanceof Error ? e.message : 'Failed to load');
          setLoading(false);
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );

  useEffect(() => {
    setItems([]);
    setMeta(null);
    load(1);
  }, [load]);

  const hasMore = !!meta && meta.page < meta.total_pages;
  return {
    items, loading, error, total: meta?.total,
    loadMore: () => hasMore && !loading && meta && load(meta.page + 1),
    reload: () => load(1),
  };
}
