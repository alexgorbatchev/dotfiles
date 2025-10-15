import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '@modules/logger/utils';

export const versionCheckerLogMessages = {
  initializing: () => createSafeLogMessage('Initializing VersionChecker with githubClient'),
  fetchingLatestRelease: (owner: string, repo: string) =>
    createSafeLogMessage(`Fetching latest version for ${owner}/${repo}`),
  latestReleaseFound: (version: string) => createSafeLogMessage(`Latest release found ${version}`),
  latestReleaseError: (owner: string, repo: string, reason: string) =>
    createSafeLogMessage(`Failed to fetch latest release for ${owner}/${repo}: ${reason}`),
  noLatestRelease: (owner: string, repo: string) =>
    createSafeLogMessage(`No latest release found for ${owner}/${repo}`),
  comparingVersions: (configuredVersion: string, latestVersion: string) =>
    createSafeLogMessage(`Comparing versions configured ${configuredVersion} vs latest ${latestVersion}`),
  invalidConfiguredVersion: (configuredVersion: string) =>
    createSafeLogMessage(`Configured version invalid ${configuredVersion}`),
  invalidLatestVersion: (latestVersion: string) =>
    createSafeLogMessage(`Latest version invalid ${latestVersion}`),
  versionComparisonResult: (result: string) =>
    createSafeLogMessage(`Version comparison result ${result}`),
} satisfies SafeLogMessageMap;
