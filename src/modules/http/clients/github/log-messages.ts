import { createSafeLogMessage, type SafeLogMessageMap } from '@modules/logger';

export const gitHubHttpClientLogMessages = {
  fetchingLatestRelease: (owner: string, repo: string) =>
    createSafeLogMessage(`GitHub fetching latest release ${owner}/${repo}`),
  fetchingReleaseByTag: (owner: string, repo: string, tag: string) =>
    createSafeLogMessage(`GitHub fetching release ${owner}/${repo} tag ${tag}`),
  releaseFetched: (tag: string) => createSafeLogMessage(`GitHub release fetched tag ${tag}`),
  fetchingRateLimit: () => createSafeLogMessage('GitHub fetching rate limit status'),
  rateLimitFetched: () => createSafeLogMessage('GitHub rate limit status fetched'),
  downloadingBinary: (url: string) => createSafeLogMessage(`GitHub downloading binary from ${url}`),
  binaryDownloaded: (url: string, bytes: number) =>
    createSafeLogMessage(`GitHub binary downloaded from ${url} size ${bytes} bytes`),
} satisfies SafeLogMessageMap;
