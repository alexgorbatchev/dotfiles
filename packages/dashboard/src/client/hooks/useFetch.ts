import { useCallback, useLayoutEffect, useState } from "preact/hooks";
import { fetchApi } from "../api";
import { subscribeFetchInvalidation } from "../invalidateFetches";

interface IUseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  stale: boolean;
  refetch: () => void;
}

interface IFetchState<T> {
  key: string;
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export function useFetch<T>(endpoint: string, deps: unknown[] = []): IUseFetchResult<T> {
  const key = JSON.stringify([endpoint, deps]);
  const [state, setState] = useState<IFetchState<T>>({ key, data: null, loading: true, error: null });
  const [revision, setRevision] = useState(0);

  const refetch = useCallback((): void => {
    setRevision((value) => value + 1);
  }, []);

  useLayoutEffect(
    () =>
      subscribeFetchInvalidation((endpoints) => {
        if (endpoints.length === 0 || endpoints.includes(endpoint)) refetch();
      }),
    [endpoint, refetch],
  );

  useLayoutEffect(() => {
    const controller = new AbortController();
    const isCurrent = (): boolean => !controller.signal.aborted;

    setState((previous) => ({ key, data: previous.key === key ? previous.data : null, loading: true, error: null }));
    const load = async (): Promise<void> => {
      try {
        const data = await fetchApi<T>(endpoint, controller.signal);
        if (isCurrent()) setState({ key, data, loading: false, error: null });
      } catch (error) {
        if (isCurrent())
          setState((previous) => ({
            key,
            data: previous.key === key ? previous.data : null,
            loading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          }));
      }
    };
    void load();
    return () => controller.abort();
  }, [endpoint, key, revision]);

  const current = state.key === key ? state : { data: null, loading: true, error: null };
  return {
    data: current.data,
    loading: current.loading,
    error: current.error,
    stale: current.data !== null && current.error !== null,
    refetch,
  };
}
