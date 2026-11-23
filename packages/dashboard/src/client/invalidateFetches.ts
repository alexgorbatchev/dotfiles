type FetchInvalidationListener = (endpoints: readonly string[]) => void;

const listeners = new Set<FetchInvalidationListener>();

/** Refresh matching mounted queries; no endpoints refreshes all mounted queries. */
export function invalidateFetches(...endpoints: string[]): void {
  for (const listener of listeners) listener(endpoints);
}

export function subscribeFetchInvalidation(listener: FetchInvalidationListener): VoidFunction {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
