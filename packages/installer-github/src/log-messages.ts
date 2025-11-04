import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  fetchLatest: (repo: string) => createSafeLogMessage(`Getting latest release for ${repo}`),
  fetchByTag: (version: string, repo: string) => createSafeLogMessage(`Fetching release ${version} for ${repo}`),
  assetSelectorCustom: () => createSafeLogMessage('Using custom asset selector'),
  assetPatternMatch: (pattern: string) => createSafeLogMessage(`Finding asset matching pattern: ${pattern}`),
  assetPlatformMatch: (platform: string, arch: string) =>
    createSafeLogMessage(`Selecting asset for platform ${platform} and architecture ${arch}`),
  determiningDownloadUrl: (rawUrl: string, customHost: string | undefined) =>
    createSafeLogMessage(
      `Determining download URL. rawBrowserDownloadUrl="${rawUrl}", customHost="${customHost ?? '(public GitHub)'}"`
    ),
  usingAbsoluteUrl: (url: string) => createSafeLogMessage(`Using absolute browser_download_url directly: "${url}"`),
  invalidRelativeUrl: (rawUrl: string) => createSafeLogMessage(`Invalid asset download URL format: ${rawUrl}`),
  resolvedRelativeUrl: (base: string, rawUrl: string, resolved: string) =>
    createSafeLogMessage(`Resolved relative URL. Base: "${base}", Relative Path: "${rawUrl}", Result: "${resolved}"`),
  finalDownloadUrl: (rawUrl: string, host: string, resolved: string) =>
    createSafeLogMessage(
      `Final download URL determined. Raw: "${rawUrl}", Configured Host: "${host}", Result: "${resolved}"`
    ),
  downloadUrlError: (rawUrl: string, host: string) =>
    createSafeLogMessage(`Download URL construction failed: Raw: "${rawUrl}", Configured Host: "${host}"`),
  downloadingAsset: (downloadUrl: string) => createSafeLogMessage(`Downloading asset: ${downloadUrl}`),
  extractingArchive: (assetName: string) => createSafeLogMessage(`Extracting archive: ${assetName}`),
  archiveExtracted: () => createSafeLogMessage('Archive extracted: %o'),
  cleaningArchive: (downloadPath: string) => createSafeLogMessage(`Cleaning up downloaded archive: ${downloadPath}`),
  invalidUrl: (url: string) => createSafeLogMessage(`Invalid URL: ${url}`),
  updateCheckFailed: (toolName: string) => createSafeLogMessage(`Failed to check update for ${toolName}`),
  updateFailed: (toolName: string) => createSafeLogMessage(`Failed to update ${toolName}`),
} as const satisfies SafeLogMessageMap;
