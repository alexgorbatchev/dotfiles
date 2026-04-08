import { createSafeLogMessage, type SafeLogMessageMap } from "@dotfiles/logger";

export const messages = {
  constructor: {
    initialized: (baseUrl: string) => createSafeLogMessage(`Gitea API client initialized. baseUrl=${baseUrl}`),
    authTokenPresent: () => createSafeLogMessage("API token is configured"),
    authTokenMissing: () => createSafeLogMessage("No API token configured"),
  } satisfies SafeLogMessageMap,
  cache: {
    enabled: (ttlMs: number) => createSafeLogMessage(`Cache enabled. TTL=${ttlMs}ms`),
    disabled: () => createSafeLogMessage("Cache is present but disabled"),
    missing: () => createSafeLogMessage("No cache configured"),
  } satisfies SafeLogMessageMap,
  request: {
    performing: (method: string, url: string) => createSafeLogMessage(`Gitea API ${method} request to ${url}`),
    emptyResponse: (url: string) => createSafeLogMessage(`Empty response from ${url}`),
  } satisfies SafeLogMessageMap,
  releases: {
    fetchingLatest: (owner: string, repo: string) =>
      createSafeLogMessage(`Fetching latest release for ${owner}/${repo}`),
    latestNotFound: (owner: string, repo: string) =>
      createSafeLogMessage(`Latest release not found for ${owner}/${repo}`),
    latestError: (owner: string, repo: string) =>
      createSafeLogMessage(`Error fetching latest release for ${owner}/${repo}`),
    fetchingByTag: (tag: string, owner: string, repo: string) =>
      createSafeLogMessage(`Fetching release by tag ${tag} for ${owner}/${repo}`),
    tagNotFound: (tag: string, owner: string, repo: string) =>
      createSafeLogMessage(`Release tag ${tag} not found for ${owner}/${repo}`),
    tagError: (tag: string, owner: string, repo: string) =>
      createSafeLogMessage(`Error fetching release ${tag} for ${owner}/${repo}`),
    fetchingAll: (owner: string, repo: string) => createSafeLogMessage(`Fetching all releases for ${owner}/${repo}`),
    fetchingPage: (page: number, endpoint: string) => createSafeLogMessage(`Fetching page ${page}: ${endpoint}`),
    totalFetched: (count: number, owner: string, repo: string) =>
      createSafeLogMessage(`Fetched ${count} releases for ${owner}/${repo}`),
    filteredPrereleases: (count: number) => createSafeLogMessage(`After filtering prereleases: ${count} releases`),
    fetchingLatestTags: (owner: string, repo: string, count: number) =>
      createSafeLogMessage(`Fetching ${count} latest release tags for ${owner}/${repo}`),
    fetchedTags: (count: number) => createSafeLogMessage(`Fetched ${count} release tags`),
    fetchTagsError: (owner: string, repo: string) =>
      createSafeLogMessage(`Error fetching release tags for ${owner}/${repo}`),
  } satisfies SafeLogMessageMap,
  errors: {
    requestFailure: (url: string) => createSafeLogMessage(`Request failure: ${url}`),
    notFound: (url: string) => createSafeLogMessage(`Resource not found: ${url}`),
    rateLimit: (url: string) => createSafeLogMessage(`Rate limit exceeded: ${url}`),
    forbidden: (url: string) => createSafeLogMessage(`Forbidden: ${url}`),
    client: (url: string, statusCode: number) => createSafeLogMessage(`Client error ${statusCode}: ${url}`),
    server: (url: string, statusCode: number) => createSafeLogMessage(`Server error ${statusCode}: ${url}`),
    http: (url: string, statusCode: number) => createSafeLogMessage(`HTTP error ${statusCode}: ${url}`),
    network: (url: string) => createSafeLogMessage(`Network error: ${url}`),
    unknown: (url: string) => createSafeLogMessage(`Unknown error: ${url}`),
  } satisfies SafeLogMessageMap,
} as const;
