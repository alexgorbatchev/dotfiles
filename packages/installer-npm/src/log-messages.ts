import { createSafeLogMessage, type SafeLogMessageMap } from "@dotfiles/logger";

export const messages = {
  installing: (packageName: string) => createSafeLogMessage(`Installing from npm: package=${packageName}`),
  executingCommand: (command: string) => createSafeLogMessage(`Executing command: ${command}`),
  versionFetched: (packageName: string, version: string) =>
    createSafeLogMessage(`Fetched version ${version} for npm package ${packageName}`),
  versionFetchFailed: (packageName: string) =>
    createSafeLogMessage(`Failed to fetch version for npm package ${packageName}`),
  updateCheckFailed: () => createSafeLogMessage("Failed to check update for npm tool"),
  removingExistingBinary: (binPath: string) =>
    createSafeLogMessage(`Force option enabled. Removing existing file: ${binPath}`),
} as const satisfies SafeLogMessageMap;
