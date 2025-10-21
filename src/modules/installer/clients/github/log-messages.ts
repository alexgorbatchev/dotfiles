import { createSafeLogMessage, type SafeLogMessageMap } from '@modules/logger';

export const githubApiClientLogMessages = {
  constructor: {
    initialized: (baseUrl: string, userAgent: string) =>
      createSafeLogMessage(`GitHub API client initialized with base URL ${baseUrl} and User-Agent ${userAgent}`),
    authTokenPresent: () => createSafeLogMessage('GitHub token authentication enabled'),
    authTokenMissing: () => createSafeLogMessage('No GitHub token provided; requests will be unauthenticated'),
  } satisfies SafeLogMessageMap,
  cache: {
    enabled: (ttlMs: number) => createSafeLogMessage(`GitHub API cache enabled with TTL ${ttlMs} ms`),
    disabled: () => createSafeLogMessage('GitHub API cache provided but disabled by configuration'),
    missing: () => createSafeLogMessage('No GitHub API cache provided; responses will not be cached'),
  } satisfies SafeLogMessageMap,
  request: {
    performing: (method: string, url: string) => createSafeLogMessage(`GitHub API ${method} request to ${url}`),
    emptyResponse: (url: string) => createSafeLogMessage(`GitHub API returned an empty response buffer for ${url}`),
  } satisfies SafeLogMessageMap,
  errors: {
    requestFailure: (url: string) => createSafeLogMessage(`GitHub API request failure for ${url}`),
    notFound: (url: string) => createSafeLogMessage(`GitHub resource not found for ${url}`),
    rateLimit: (url: string, resetTime: string) =>
      createSafeLogMessage(`GitHub API rate limit exceeded for ${url}, resets at ${resetTime}`),
    forbidden: (url: string) => createSafeLogMessage(`GitHub API request forbidden for ${url}`),
    client: (url: string, statusCode: number) =>
      createSafeLogMessage(`GitHub API client error for ${url} with status ${statusCode}`),
    server: (url: string, statusCode: number) =>
      createSafeLogMessage(`GitHub API server error for ${url} with status ${statusCode}`),
    http: (url: string, statusCode: number) =>
      createSafeLogMessage(`GitHub API HTTP error for ${url} with status ${statusCode}`),
    network: (url: string, reason: string) => createSafeLogMessage(`GitHub API network error for ${url}: ${reason}`),
    unknown: (url: string) => createSafeLogMessage(`Unknown GitHub API error for ${url}`),
    constraintLatestError: (message: string) =>
      createSafeLogMessage(`GitHub API latest constraint lookup failed: ${message}`),
    constraintError: (constraint: string, owner: string, repo: string, message: string) =>
      createSafeLogMessage(
        `GitHub API error while evaluating constraint ${constraint} for ${owner}/${repo}: ${message}`
      ),
  } satisfies SafeLogMessageMap,
  releases: {
    fetchingLatest: (owner: string, repo: string) =>
      createSafeLogMessage(`Fetching latest GitHub release for ${owner}/${repo}`),
    latestNotFound: (owner: string, repo: string) =>
      createSafeLogMessage(`Latest GitHub release not found for ${owner}/${repo}`),
    latestError: (owner: string, repo: string, message: string) =>
      createSafeLogMessage(`Error fetching latest GitHub release for ${owner}/${repo}: ${message}`),
    fetchingByTag: (tag: string, owner: string, repo: string) =>
      createSafeLogMessage(`Fetching GitHub release ${tag} for ${owner}/${repo}`),
    tagNotFound: (tag: string, owner: string, repo: string) =>
      createSafeLogMessage(`GitHub release ${tag} not found for ${owner}/${repo}`),
    tagError: (tag: string, owner: string, repo: string, message: string) =>
      createSafeLogMessage(`Error fetching GitHub release ${tag} for ${owner}/${repo}: ${message}`),
    fetchingAll: (owner: string, repo: string) =>
      createSafeLogMessage(`Fetching all GitHub releases for ${owner}/${repo}`),
    fetchingPage: (page: number, endpoint: string) =>
      createSafeLogMessage(`Fetching GitHub releases page ${page} via ${endpoint}`),
    totalFetched: (count: number, owner: string, repo: string) =>
      createSafeLogMessage(`Fetched ${count} GitHub releases for ${owner}/${repo}`),
    filteredPrereleases: (count: number) =>
      createSafeLogMessage(`Filtered prereleases leaving ${count} GitHub releases`),
  } satisfies SafeLogMessageMap,
  constraints: {
    searching: (constraint: string, owner: string, repo: string) =>
      createSafeLogMessage(`Searching for GitHub release matching constraint ${constraint} in ${owner}/${repo}`),
    pageFetch: (constraint: string) =>
      createSafeLogMessage(`Iterating GitHub releases pages for constraint ${constraint}`),
    pageRequest: (page: number, owner: string, repo: string) =>
      createSafeLogMessage(`Fetching GitHub releases page ${page} for ${owner}/${repo}`),
    bestCandidate: (tag: string, version: string) =>
      createSafeLogMessage(`Best GitHub release candidate so far ${tag} (version ${version})`),
    resultFound: (constraint: string, tag: string) =>
      createSafeLogMessage(`Found GitHub release ${tag} for constraint ${constraint}`),
    resultMissing: (constraint: string) => createSafeLogMessage(`No GitHub release found for constraint ${constraint}`),
  } satisfies SafeLogMessageMap,
  rateLimit: {
    fetching: () => createSafeLogMessage('Fetching GitHub API rate limit status'),
  } satisfies SafeLogMessageMap,
} as const;
