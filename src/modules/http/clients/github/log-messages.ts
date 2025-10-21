import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '@modules/logger/utils';

export const gitHubHttpClientLogMessages = {
  fetchingLatestRelease: (owner: string, repo: string) =>
    createSafeLogMessage(`GitHub fetching latest release ${owner}/${repo}`),
  fetchingReleaseByTag: (owner: string, repo: string, tag: string) =>
    createSafeLogMessage(`GitHub fetching release ${owner}/${repo} tag ${tag}`),
  releaseFetched: (tag: string) => createSafeLogMessage(`GitHub release fetched tag ${tag}`),
  fetchingRateLimit: () => createSafeLogMessage('GitHub fetching rate limit status'),
  rateLimitFetched: () => createSafeLogMessage('GitHub rate limit status fetched'),
} satisfies SafeLogMessageMap;
