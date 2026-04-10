function getCurrentUrl(): URL | null {
  if (typeof window === "undefined") {
    return null;
  }

  return new URL(window.location.href);
}

function replaceCurrentUrl(url: URL): void {
  if (typeof window === "undefined") {
    return;
  }

  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function readQueryParamValues(paramName: string): Set<string> {
  const url = getCurrentUrl();
  return new Set(url?.searchParams.getAll(paramName) ?? []);
}

export function writeQueryParamValues(paramName: string, values: Iterable<string>): void {
  const url = getCurrentUrl();
  if (!url) {
    return;
  }

  url.searchParams.delete(paramName);

  const uniqueValues = Array.from(new Set(values)).sort();
  for (const value of uniqueValues) {
    url.searchParams.append(paramName, value);
  }

  replaceCurrentUrl(url);
}

export function readHash(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return decodeURIComponent(window.location.hash.replace(/^#/, ""));
}

export function writeHash(hash: string): void {
  const url = getCurrentUrl();
  if (!url || readHash() === hash) {
    return;
  }

  url.hash = hash;
  replaceCurrentUrl(url);
}
