import { createSafeLogMessage, type SafeLogMessageMap } from "@dotfiles/logger";

export const messages = {
  installing: (packageName: string) => createSafeLogMessage(`Installing from APT: package=${packageName}`),
  executingCommand: (command: string) => createSafeLogMessage(`Executing command: ${command}`),
  binaryNotFound: (binaryName: string) =>
    createSafeLogMessage(`Binary not found in PATH after APT install: ${binaryName}`),
  versionFetchFailed: (packageName: string) =>
    createSafeLogMessage(`Failed to fetch installed APT package version: ${packageName}`),
} as const satisfies SafeLogMessageMap;
