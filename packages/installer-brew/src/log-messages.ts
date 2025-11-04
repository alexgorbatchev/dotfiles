import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  installing: (toolName: string) => createSafeLogMessage(`Installing from brew: toolName=${toolName}`),
  executingCommand: (command: string) => createSafeLogMessage(`installFromBrew: Executing command: ${command}`),
  fetchingVersion: (formula: string) => createSafeLogMessage(`Fetching version info for formula: ${formula}`),
  versionFetched: (formula: string, version: string) =>
    createSafeLogMessage(`Fetched version ${version} for formula ${formula}`),
  versionNotFound: (formula: string) => createSafeLogMessage(`No stable version found for formula ${formula}`),
  versionFetchFailed: (formula: string) => createSafeLogMessage(`Failed to fetch version for formula ${formula}`),
  updateCheckNotImplemented: (toolName: string) =>
    createSafeLogMessage(`Update check not fully implemented for brew tool: ${toolName}`),
} as const satisfies SafeLogMessageMap;
