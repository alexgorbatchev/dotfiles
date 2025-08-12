import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const githubClientDebugTemplates = {
  constructorInit: (): SafeLogMessage =>
    createSafeLogMessage('GitHub API Client initialized. Base URL: %s, User-Agent: %s'),
  authToken: (): SafeLogMessage => createSafeLogMessage('Using GitHub token for authentication.'),
  noAuthToken: (): SafeLogMessage =>
    createSafeLogMessage('No GitHub token provided; requests will be unauthenticated.'),
  cacheEnabled: (): SafeLogMessage => createSafeLogMessage('Cache enabled with TTL of %d ms'),
  cacheDisabled: (): SafeLogMessage => createSafeLogMessage('Cache available but disabled by configuration'),
  noCache: (): SafeLogMessage => createSafeLogMessage('No cache provided; API responses will not be cached'),
  cacheKeyGenerated: (): SafeLogMessage => createSafeLogMessage('Generated key for %s %s'),
  cacheHit: (): SafeLogMessage => createSafeLogMessage('Cache hit for %s request to %s'),
  cacheMiss: (): SafeLogMessage => createSafeLogMessage('Cache miss for %s request to %s'),
  cacheError: (): SafeLogMessage => createSafeLogMessage('Error checking cache for %s request to %s: %s'),
  makingRequest: (): SafeLogMessage => createSafeLogMessage('Making %s request to %s'),
  emptyResponse: (): SafeLogMessage => createSafeLogMessage('Empty response buffer from downloader for URL: %s'),
  cachedResponse: (): SafeLogMessage => createSafeLogMessage('Cached response for %s request to %s'),
  cacheStoreError: (): SafeLogMessage =>
    createSafeLogMessage('Error storing response in cache for %s request to %s: %s'),
  requestError: (): SafeLogMessage => createSafeLogMessage('Request failed with error for %s: %o'),
  notFound: (): SafeLogMessage => createSafeLogMessage('GitHub resource not found (404): %s. Body: %s'),
  rateLimitError: (): SafeLogMessage => createSafeLogMessage('Rate limit exceeded for %s. Reset time: %s, Body: %s'),
  forbidden: (): SafeLogMessage => createSafeLogMessage('GitHub API access forbidden (403): %s. Body: %s'),
  clientError: (): SafeLogMessage => createSafeLogMessage('Client error (4xx) for %s. Status: %d, Body: %s'),
  serverError: (): SafeLogMessage => createSafeLogMessage('Server error (5xx) for %s. Status: %d, Body: %s'),
  networkError: (): SafeLogMessage => createSafeLogMessage('Network error for %s: %s'),
  unknownError: (): SafeLogMessage => createSafeLogMessage('Unknown error for %s: %o'),
  fetchingLatestRelease: (): SafeLogMessage => createSafeLogMessage('Fetching latest release for %s/%s'),
  latestReleaseNotFound: (): SafeLogMessage => createSafeLogMessage('Resource not found for %s/%s. Returning null.'),
  latestReleaseError: (): SafeLogMessage => createSafeLogMessage('Error fetching latest release for %s/%s: %s'),
  fetchingReleaseByTag: (): SafeLogMessage => createSafeLogMessage('Fetching release by tag %s for %s/%s'),
  releaseByTagNotFound: (): SafeLogMessage =>
    createSafeLogMessage('Release with tag "%s" not found for %s/%s. Returning null.'),
  releaseByTagError: (): SafeLogMessage => createSafeLogMessage('Error fetching release by tag %s for %s/%s: %s'),
  fetchingAllReleases: (): SafeLogMessage => createSafeLogMessage('Fetching all releases for %s/%s with options: %o'),
  fetchingPage: (): SafeLogMessage => createSafeLogMessage('Fetching page %d from %s'),
  totalReleasesFetched: (): SafeLogMessage => createSafeLogMessage('Fetched %d releases in total for %s/%s'),
  constraintSearch: (): SafeLogMessage =>
    createSafeLogMessage('Searching for release matching constraint "%s" for %s/%s'),
  constraintVersions: (): SafeLogMessage => createSafeLogMessage('Available versions for constraint matching: %s'),
  constraintPageFetch: (): SafeLogMessage => createSafeLogMessage('Iterating pages to find match for constraint "%s"'),
  constraintFetchingPage: (): SafeLogMessage => createSafeLogMessage('Fetching page %d for %s/%s'),
  constraintError: (): SafeLogMessage =>
    createSafeLogMessage('Error fetching releases for constraint "%s" on %s/%s: %s'),
  constraintCandidate: (): SafeLogMessage => createSafeLogMessage('Checking release candidate: %s (published %s)'),
  constraintPageLimit: (): SafeLogMessage => createSafeLogMessage('Reached page limit (100), stopping search.'),
  constraintResult: (): SafeLogMessage =>
    createSafeLogMessage('Found matching release for constraint "%s": %s (published %s)'),
  constraintNotFound: (): SafeLogMessage => createSafeLogMessage('No release found for constraint "%s"'),
  fetchingRateLimit: (): SafeLogMessage => createSafeLogMessage('Fetching rate limit status.'),
  filteredPrereleases: (): SafeLogMessage => createSafeLogMessage('Filtered out prereleases, %d releases remaining.'),
  constraintLatestError: (): SafeLogMessage =>
    createSafeLogMessage('Error fetching latest release for constraint "latest": %s'),
  constraintBestCandidate: (): SafeLogMessage => createSafeLogMessage('New best candidate found: %s (version %s)'),
  constraintFinalResult: (): SafeLogMessage => createSafeLogMessage('Final best release for constraint "%s" is %s'),
  // Previous methods for compatibility
  constructorDebug: (): SafeLogMessage => createSafeLogMessage('baseURL=%s, token=%s'),
  requestDebug: (): SafeLogMessage => createSafeLogMessage('Making request: %s %s'),
  responseDebug: (): SafeLogMessage => createSafeLogMessage('Response: status=%d, headers=%o'),
  rateLimitInfo: (): SafeLogMessage => createSafeLogMessage('Rate limit: remaining=%d, reset=%s'),
  retryAttempt: (): SafeLogMessage => createSafeLogMessage('Retry attempt %d/%d for: %s'),
  paginationDebug: (): SafeLogMessage => createSafeLogMessage('Fetching page %d of results'),
  authenticationDebug: (): SafeLogMessage => createSafeLogMessage('Using authentication: %s'),
} as const;
