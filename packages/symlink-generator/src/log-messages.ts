import { createSafeLogMessage, type SafeLogMessageMap } from '@dotfiles/logger';

export const messages = {
  generate: {
    processingTool: (toolName: string) => createSafeLogMessage(`Processing symlinks for tool "${toolName}"`),
    missingToolConfig: (toolName: string) =>
      createSafeLogMessage(`Tool config for "${toolName}" is undefined. Skipping.`),
  } satisfies SafeLogMessageMap,
  process: {
    symlinkDetails: (source: string, sourceAbs: string, target: string, targetAbs: string) =>
      createSafeLogMessage(
        `Processing symlink: source="${source}" (abs: "${sourceAbs}"), target="${target}" (abs: "${targetAbs}")`
      ),
    sourceMissing: (toolName: string, sourceAbsPath: string) =>
      createSafeLogMessage(`Tool "${toolName}" source file not found: ${sourceAbsPath}`),
    targetExists: (targetAbsPath: string) => createSafeLogMessage(`Target path "${targetAbsPath}" already exists.`),
    skipExistingTarget: (targetAbsPath: string) =>
      createSafeLogMessage(`Target "${targetAbsPath}" exists and overwrite is false. Skipping symlink creation.`),
  } satisfies SafeLogMessageMap,
  filesystem: {
    backupFailed: (targetAbsPath: string) => createSafeLogMessage(`Failed to write backup of ${targetAbsPath}`),
    deleteFailed: (targetAbsPath: string) => createSafeLogMessage(`Failed to delete ${targetAbsPath}`),
    directoryCreateFailed: (directoryPath: string) =>
      createSafeLogMessage(`Failed to create directory ${directoryPath}`),
    symlinkFailed: (source: string, target: string) =>
      createSafeLogMessage(`Failed to create symlink ${source} → ${target}`),
    symlinkAlreadyExists: (symlinkPath: string, target: string) =>
      createSafeLogMessage(`Symlink already exists and is valid: ${symlinkPath} -> ${target}`),
    creatingSymlink: (symlinkPath: string, targetPath: string) =>
      createSafeLogMessage(`Creating symlink: ${symlinkPath} -> ${targetPath}`),
    symlinkCreated: (symlinkPath: string, targetPath: string) =>
      createSafeLogMessage(`Successfully created symlink: ${symlinkPath} -> ${targetPath}`),
    removingBrokenSymlink: (symlinkPath: string) =>
      createSafeLogMessage(`Removing broken symlink: ${symlinkPath}`),
  } satisfies SafeLogMessageMap,
} as const;
