import { createSafeLogMessage, type SafeLogMessageMap } from '@modules/logger';

export const symlinkGeneratorLogMessages = {
  constructor: {
    initialized: () => createSafeLogMessage('SymlinkGenerator initialized'),
  } satisfies SafeLogMessageMap,
  generate: {
    started: () => createSafeLogMessage('Starting symlink generation. Options: %o, FileSystem: %s'),
    processingTool: (toolName: string) =>
      createSafeLogMessage(`Processing symlinks for tool "${toolName}"`),
    missingToolConfig: (toolName: string) =>
      createSafeLogMessage(`Tool config for "${toolName}" is undefined. Skipping.`),
    noSymlinks: (toolName: string) =>
      createSafeLogMessage(`Tool "${toolName}" has no symlinks defined, skipping.`),
    completed: () => createSafeLogMessage('Symlink generation process completed. Results: %o'),
  } satisfies SafeLogMessageMap,
  process: {
    symlinkDetails: (source: string, sourceAbs: string, target: string, targetAbs: string) =>
      createSafeLogMessage(
        `Processing symlink: source="${source}" (abs: "${sourceAbs}"), target="${target}" (abs: "${targetAbs}")`
      ),
    sourceMissing: (toolName: string, sourceAbsPath: string) =>
      createSafeLogMessage(`Tool "${toolName}" source file not found: ${sourceAbsPath}`),
    targetExists: (targetAbsPath: string) =>
      createSafeLogMessage(`Target path "${targetAbsPath}" already exists.`),
    skipExistingTarget: (targetAbsPath: string) =>
      createSafeLogMessage(`Target "${targetAbsPath}" exists and overwrite is false. Skipping symlink creation.`),
  } satisfies SafeLogMessageMap,
  filesystem: {
    backupFailed: (targetAbsPath: string, reason: string) =>
      createSafeLogMessage(`Failed to write backup of ${targetAbsPath}: ${reason}`),
    deleteFailed: (targetAbsPath: string, reason: string) =>
      createSafeLogMessage(`Failed to delete ${targetAbsPath}: ${reason}`),
    directoryCreateFailed: (directoryPath: string, reason: string) =>
      createSafeLogMessage(`Failed to create directory ${directoryPath}: ${reason}`),
    symlinkFailed: (source: string, target: string, reason: string) =>
      createSafeLogMessage(`Failed to create symlink ${source} → ${target}: ${reason}`),
  } satisfies SafeLogMessageMap,
} as const;
