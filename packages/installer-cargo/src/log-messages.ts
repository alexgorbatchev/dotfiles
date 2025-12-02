import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  installing: (toolName: string) => createSafeLogMessage(`Installing from cargo: ${toolName}`),
  foundVersion: (crateName: string, version: string) =>
    createSafeLogMessage(`Found crate ${crateName} version ${version}`),
  downloadingAsset: (assetName: string, url: string) =>
    createSafeLogMessage(`Downloading asset ${assetName} from ${url}`),
  archiveExtracted: () => createSafeLogMessage('Archive extracted: %o'),
  cleaningArchive: (archivePath: string) => createSafeLogMessage(`Cleaning up downloaded archive: ${archivePath}`),
  parsingMetadata: (cargoTomlUrl: string) => createSafeLogMessage(`Parsing crate metadata from: ${cargoTomlUrl}`),
  queryingCratesIo: (crateName: string) => createSafeLogMessage(`Querying crates.io API for crate: ${crateName}`),
  queryingGitHubReleases: (repo: string) => createSafeLogMessage(`Querying GitHub releases for ${repo}`),
  versionResolutionResolved: (toolName: string, version: string) =>
    createSafeLogMessage(`Resolved version for ${toolName}: ${version}`),
  versionResolutionFailed: (toolName: string, error: string) =>
    createSafeLogMessage(`Failed to resolve version for ${toolName}: ${error}`),
  versionResolutionException: (toolName: string, error: unknown) =>
    createSafeLogMessage(`Exception while resolving version for ${toolName}: ${String(error)}`),
  updateCheckFailed: (toolName: string) => createSafeLogMessage(`Failed to check update for cargo tool: ${toolName}`),
} as const satisfies SafeLogMessageMap;
