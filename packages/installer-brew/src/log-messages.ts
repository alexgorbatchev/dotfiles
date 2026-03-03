import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  installing: (toolName: string) => createSafeLogMessage(`Installing from brew: toolName=${toolName}`),
  executingCommand: (command: string) => createSafeLogMessage(`installFromBrew: Executing command: ${command}`),
  fetchingVersion: (formula: string) => createSafeLogMessage(`Fetching version info for formula: ${formula}`),
  versionFetched: (formula: string, version: string) =>
    createSafeLogMessage(`Fetched version ${version} for formula ${formula}`),
  versionNotFound: (formula: string) => createSafeLogMessage(`No stable version found for formula ${formula}`),
  versionFetchFailed: (formula: string) => createSafeLogMessage(`Failed to fetch version for formula ${formula}`),
  prefixFetched: (formula: string, prefix: string) =>
    createSafeLogMessage(`Formula ${formula} installed at prefix: ${prefix}`),
  prefixFetchFailed: (formula: string) => createSafeLogMessage(`Failed to fetch prefix for formula ${formula}`),
  prefixFallback: (formula: string, prefix: string) =>
    createSafeLogMessage(`Using fallback prefix for formula ${formula}: ${prefix}`),
} as const satisfies SafeLogMessageMap;
