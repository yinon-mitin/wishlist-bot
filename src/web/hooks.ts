import { useEffect, useState } from 'preact/hooks';
import { ApiError } from './api';

interface AsyncState<T> {
  data?: T;
  error?: ApiError;
  loading: boolean;
}

/** Loads data when `deps` change. Keeps the old data on reload so the screen does not flicker. */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ data: s.data, loading: true }));
    load().then(
      (data) => live && setState({ data, loading: false }),
      (e) => live && setState((s) => ({ data: s.data, loading: false, error: e instanceof ApiError ? e : new ApiError(0, 'network') })),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return {
    ...state,
    reload: () => setTick((n) => n + 1),
    set: (data: T) => setState({ data, loading: false }),
  };
}
