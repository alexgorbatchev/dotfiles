import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  installing: (packageName: string) => createSafeLogMessage(`Installing from npm: package=${packageName}`),
  executingCommand: (command: string) => createSafeLogMessage(`installFromNpm: Executing command: ${command}`),
  versionFetched: (packageName: string, version: string) =>
    createSafeLogMessage(`Fetched version ${version} for npm package ${packageName}`),
  versionFetchFailed: (packageName: string) =>
    createSafeLogMessage(`Failed to fetch version for npm package ${packageName}`),
  updateCheckNotImplemented: (toolName: string) =>
    createSafeLogMessage(`Update check not fully implemented for npm tool: ${toolName}`),
} as const satisfies SafeLogMessageMap;
