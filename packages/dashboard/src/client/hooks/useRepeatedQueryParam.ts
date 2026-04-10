import { useCallback, useEffect, useState } from "preact/hooks";

import { readQueryParamValues, writeQueryParamValues } from "./urlState";

export type RepeatedQueryParamValueUpdater = (previousValues: ReadonlySet<string>) => Iterable<string>;
export type RepeatedQueryParamValues = Iterable<string> | RepeatedQueryParamValueUpdater;
export type UseRepeatedQueryParamResult = readonly [
  ReadonlySet<string>,
  (nextValues: RepeatedQueryParamValues) => void,
];

export function useRepeatedQueryParam(paramName: string): UseRepeatedQueryParamResult {
  const [values, setValues] = useState<Set<string>>(() => readQueryParamValues(paramName));

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setValues(readQueryParamValues(paramName));

    function syncFromUrl(): void {
      setValues(readQueryParamValues(paramName));
    }

    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [paramName]);

  const updateValues = useCallback(
    (nextValues: RepeatedQueryParamValues) => {
      setValues((previousValues) => {
        const resolvedValues = nextValues instanceof Function ? nextValues(previousValues) : nextValues;
        const nextValueSet = new Set(resolvedValues);

        writeQueryParamValues(paramName, nextValueSet);
        return nextValueSet;
      });
    },
    [paramName],
  );

  return [values, updateValues] as const;
}
