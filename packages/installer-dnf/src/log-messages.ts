import { createSafeLogMessage, type SafeLogMessageMap } from "@dotfiles/logger";

export const messages = {
  installing: (packageName: string) => createSafeLogMessage(`Installing from DNF: package=${packageName}`),
  executingCommand: (command: string) => createSafeLogMessage(`Executing command: ${command}`),
  binaryNotFound: (binaryName: string) =>
    createSafeLogMessage(`Binary not found in PATH after DNF install: ${binaryName}`),
  versionFetchFailed: (packageName: string) =>
    createSafeLogMessage(`Failed to fetch installed DNF package version: ${packageName}`),
} as const satisfies SafeLogMessageMap;
