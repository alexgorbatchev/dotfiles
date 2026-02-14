import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  startingInstallation: (toolName: string) => createSafeLogMessage(`Starting installation: ${toolName}`),
  fetchLatest: (repo: string) => createSafeLogMessage(`Getting latest release for ${repo}`),
  fetchByTag: (version: string, repo: string) => createSafeLogMessage(`Fetching release ${version} for ${repo}`),
  assetSelectorCustom: () => createSafeLogMessage('Using custom asset selector'),
  assetPatternMatch: (pattern: string) => createSafeLogMessage(`Finding asset matching pattern: ${pattern}`),
  assetPlatformMatch: (platform: string, arch: string) =>
    createSafeLogMessage(`Selecting asset for platform ${platform} and architecture ${arch}`),
  downloadingAsset: (downloadUrl: string) => createSafeLogMessage(`Downloading asset: ${downloadUrl}`),
  extractingArchive: (assetName: string) => createSafeLogMessage(`Extracting archive: ${assetName}`),
  archiveExtracted: (fileCount: number, executableCount: number) =>
    createSafeLogMessage(`Archive extracted. fileCount=${fileCount}, executableCount=${executableCount}`),
  cleaningArchive: (downloadPath: string) => createSafeLogMessage(`Cleaning up downloaded archive: ${downloadPath}`),
  versionResolutionResolved: (toolName: string, version: string) =>
    createSafeLogMessage(`Resolved version for ${toolName}: ${version}`),
  versionResolutionFailed: (toolName: string, error: string) =>
    createSafeLogMessage(`Failed to resolve version for ${toolName}: ${error}`),
  versionResolutionException: (toolName: string) =>
    createSafeLogMessage(`Exception while resolving version for ${toolName}`),
  updateCheckFailed: (toolName: string) => createSafeLogMessage(`Failed to check update for ${toolName}`),
  updateFailed: (toolName: string) => createSafeLogMessage(`Failed to update ${toolName}`),
  availableReleaseTags: () => createSafeLogMessage('Available release tags:'),
  releaseTagItem: (tag: string) => createSafeLogMessage(`  - ${tag}`),
  noReleaseTagsAvailable: () => createSafeLogMessage('No release tags available for this repository'),
} as const satisfies SafeLogMessageMap;
