import type { ShellType } from '@dotfiles/core';
import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  constructor: {
    initialized: () => createSafeLogMessage('ShellInitGenerator initialized'),
  } satisfies SafeLogMessageMap,
  generate: {
    parsedToolCount: (toolConfigCount: number) =>
      createSafeLogMessage(`Resolved ${toolConfigCount} tool configurations for shell init generation`),
    resolvedOutputPath: (outputPath: string) =>
      createSafeLogMessage(`Shell init output path resolved to ${outputPath}`),
    shellTypeFailure: (shellType: ShellType) => createSafeLogMessage(`Shell init generation failed for ${shellType}`),
    writeFailure: (targetPath: string) => createSafeLogMessage(`Failed to write shell init artifact ${targetPath}`),
  } satisfies SafeLogMessageMap,
  profiles: {
    starting: (entryCount: number) => createSafeLogMessage(`Updating ${entryCount} shell profile entries`),
  } satisfies SafeLogMessageMap,
  cleanup: {
    onceScriptRemoved: (scriptPath: string) => createSafeLogMessage(`Removed stale once script ${scriptPath}`),
    failure: (directoryPath: string) =>
      createSafeLogMessage(`Failed to clean shell init once directory ${directoryPath}`),
  } satisfies SafeLogMessageMap,
} as const;
