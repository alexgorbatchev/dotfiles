import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';
import type { ShellType } from '@dotfiles/schemas';

export const shellInitGeneratorLogMessages = {
  constructor: {
    initialized: () => createSafeLogMessage('ShellInitGenerator initialized'),
  } satisfies SafeLogMessageMap,
  generate: {
    started: (fileSystemName: string) => createSafeLogMessage(`Starting shell init generation using ${fileSystemName}`),
    parsedToolCount: (toolConfigCount: number) =>
      createSafeLogMessage(`Resolved ${toolConfigCount} tool configurations for shell init generation`),
    resolvedOutputPath: (outputPath: string) =>
      createSafeLogMessage(`Shell init output path resolved to ${outputPath}`),
    processingTool: (toolName: string) => createSafeLogMessage(`Processing shell init configuration for ${toolName}`),
    skippingTool: (toolName: string) => createSafeLogMessage(`Skipping shell init configuration for ${toolName}`),
    shellTypeFailure: (shellType: ShellType) =>
      createSafeLogMessage(`Shell init generation failed for ${shellType}`),
    writeFailure: (targetPath: string) =>
      createSafeLogMessage(`Failed to write shell init artifact ${targetPath}`),
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
