import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  shellCommandStarted: (command: string) => createSafeLogMessage(`Executing shell command: ${command}`),
  shellCommandFailed: (command: string, exitCode: number | null) =>
    createSafeLogMessage(`Shell command failed (exit ${exitCode ?? 'unknown'}): ${command}`),
  fileCommandFallbackFailed: (filePath: string) =>
    createSafeLogMessage(`Failed to detect archive format using file command: ${filePath}`),
  extractionRequested: (archivePath: string) => createSafeLogMessage(`Extracting archive ${archivePath}`),
  executableFlagApplied: (filePath: string) => createSafeLogMessage(`Marked file as executable: ${filePath}`),
  executableCheckFailed: (filePath: string) =>
    createSafeLogMessage(`Failed to inspect file for executable permissions: ${filePath}`),
} satisfies SafeLogMessageMap;
