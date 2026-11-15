import { useCallback, useEffect, useState } from "preact/hooks";
import type { IInventoryQuery } from "../inventory/types";
import { readInventoryQuery, writeInventoryQuery } from "../utils/inventoryUtils";

export interface IInventoryQueryState {
  query: IInventoryQuery;
  returnTo: string;
  updateQuery: (patch: Partial<IInventoryQuery>) => void;
  resetQuery: () => void;
}

export function useInventoryQuery(): IInventoryQueryState {
  const [search, setSearch] = useState(() => window.location.search);
  useEffect(() => {
    const onPopState = (): void => setSearch(window.location.search);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const applyQuery = useCallback((query: IInventoryQuery): void => {
    const nextSearch = writeInventoryQuery(window.location.search, query);
    window.history.replaceState(window.history.state, "", `/${nextSearch}${window.location.hash}`);
    setSearch(nextSearch);
  }, []);

  const updateQuery = useCallback(
    (patch: Partial<IInventoryQuery>): void => {
      applyQuery({ ...readInventoryQuery(window.location.search), ...patch });
    },
    [applyQuery],
  );

  const resetQuery = useCallback((): void => {
    applyQuery(readInventoryQuery(""));
  }, [applyQuery]);

  return { query: readInventoryQuery(search), returnTo: `/${search}`, updateQuery, resetQuery };
}
