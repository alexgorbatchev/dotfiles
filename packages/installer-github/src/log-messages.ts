import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  startingInstallation: (toolName: string) => createSafeLogMessage(`Starting installation: ${toolName}`),
  fetchLatest: (repo: string) => createSafeLogMessage(`Getting latest release for ${repo}`),
  fetchByTag: (version: string, repo: string) => createSafeLogMessage(`Fetching release ${version} for ${repo}`),
  assetSelectorCustom: () => createSafeLogMessage('Using custom asset selector'),
  assetPatternMatch: (pattern: string) => createSafeLogMessage(`Finding asset matching pattern: ${pattern}`),
  assetPlatformMatch: (platform: string, arch: string) =>
    createSafeLogMessage(`Selecting asset for platform ${platform} and architecture ${arch}`),
  determiningDownloadUrl: (rawUrl: string, hasCustomHost: boolean) =>
    createSafeLogMessage(`Determining download URL. rawBrowserDownloadUrl="${rawUrl}", hasCustomHost=${hasCustomHost}`),
  usingAbsoluteUrl: (url: string) => createSafeLogMessage(`Using absolute browser_download_url directly: "${url}"`),
  invalidRelativeUrl: (rawUrl: string) => createSafeLogMessage(`Invalid asset download URL format: ${rawUrl}`),
  resolvedRelativeUrl: (base: string, rawUrl: string, resolved: string) =>
    createSafeLogMessage(`Resolved relative URL. Base: "${base}", Relative Path: "${rawUrl}", Result: "${resolved}"`),
  finalDownloadUrl: (rawUrl: string, resolved: string, hasCustomHost: boolean) =>
    createSafeLogMessage(
      `Final download URL determined. Raw: "${rawUrl}", Result: "${resolved}", hasCustomHost=${hasCustomHost}`,
    ),
  downloadUrlError: (rawUrl: string, hasCustomHost: boolean) =>
    createSafeLogMessage(`Download URL construction failed: Raw: "${rawUrl}", hasCustomHost=${hasCustomHost}`),
  downloadingAsset: (downloadUrl: string) => createSafeLogMessage(`Downloading asset: ${downloadUrl}`),
  downloadingViaGhCli: (assetName: string) =>
    createSafeLogMessage(`Downloading ${assetName} via gh release download (authenticated)`),
  downloadingViaHttp: (assetName: string) => createSafeLogMessage(`Downloading ${assetName} via HTTP`),
  extractingArchive: (assetName: string) => createSafeLogMessage(`Extracting archive: ${assetName}`),
  archiveExtracted: (fileCount: number, executableCount: number) =>
    createSafeLogMessage(`Archive extracted. fileCount=${fileCount}, executableCount=${executableCount}`),
  cleaningArchive: (downloadPath: string) => createSafeLogMessage(`Cleaning up downloaded archive: ${downloadPath}`),
  invalidUrl: (url: string) => createSafeLogMessage(`Invalid URL: ${url}`),
  versionResolutionResolved: (toolName: string, version: string) =>
    createSafeLogMessage(`Resolved version for ${toolName}: ${version}`),
  versionResolutionFailed: (toolName: string, error: string) =>
    createSafeLogMessage(`Failed to resolve version for ${toolName}: ${error}`),
  versionResolutionException: (toolName: string) =>
    createSafeLogMessage(`Exception while resolving version for ${toolName}`),
  updateCheckFailed: (toolName: string) => createSafeLogMessage(`Failed to check update for ${toolName}`),
  updateFailed: (toolName: string) => createSafeLogMessage(`Failed to update ${toolName}`),
  detectingTagPattern: () => createSafeLogMessage('Detecting tag pattern from latest release'),
  tagPatternDetectionFailed: () => createSafeLogMessage('Failed to detect tag pattern'),
  tryingCorrectedTag: (correctedTag: string, originalTag: string) =>
    createSafeLogMessage(`Trying corrected tag '${correctedTag}' (original: '${originalTag}')`),
  usingCorrectedTag: (correctedTag: string, originalTag: string) =>
    createSafeLogMessage(`Found release with corrected tag '${correctedTag}' (you specified: '${originalTag}')`),
  availableReleaseTags: () => createSafeLogMessage('Available release tags:'),
  releaseTagItem: (tag: string) => createSafeLogMessage(`  - ${tag}`),
  noReleaseTagsAvailable: () => createSafeLogMessage('No release tags available for this repository'),
} as const satisfies SafeLogMessageMap;
