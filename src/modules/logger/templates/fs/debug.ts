import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const fsDebugTemplates = {
  // Symlink operations
  symlinkGeneratorInit: () => createSafeLogMessage('SymlinkGenerator initialized'),
  symlinkGenerateStart: () => createSafeLogMessage('Starting symlink generation. Options: %o, FileSystem: %s'),
  symlinkToolConfigUndefined: () => createSafeLogMessage('Tool config for "%s" is undefined. Skipping.'),
  symlinkNoSymlinks: () => createSafeLogMessage('Tool "%s" has no symlinks defined, skipping.'),
  symlinkProcessingTool: () => createSafeLogMessage('Processing symlinks for tool "%s"'),
  symlinkProcessing: () => createSafeLogMessage('Processing symlink: source="%s" (abs: "%s"), target="%s" (abs: "%s")'),
  symlinkTargetExists: () => createSafeLogMessage('Target path "%s" already exists.'),
  symlinkSkipTargetExists: () =>
    createSafeLogMessage('Target "%s" exists and overwrite is false. Skipping symlink creation.'),
  symlinkBackupAttempt: () =>
    createSafeLogMessage('Backup option enabled. Attempting to rename "%s" to "%s" using %s.'),
  symlinkBackupSuccess: () => createSafeLogMessage('Successfully backed up "%s" to "%s" using %s.'),
  symlinkOverwriteDelete: () => createSafeLogMessage('Overwrite enabled. Attempting to delete "%s" using %s.'),
  symlinkDeleteSuccess: () => createSafeLogMessage('Successfully deleted "%s" for overwrite using %s.'),
  symlinkEnsureDir: () => createSafeLogMessage('Ensuring target directory "%s" exists using %s.'),
  symlinkAttempt: () => createSafeLogMessage('Attempting to create symlink from "%s" to "%s" using %s.'),
  symlinkSuccess: () => createSafeLogMessage('Successfully created symlink from "%s" to "%s" using %s.'),
  symlinkGenerationComplete: () => createSafeLogMessage('Symlink generation process completed. Results: %o'),

  // Shim operations
  shimConstructor: () => createSafeLogMessage('fileSystem=%o, config=%o'),
  shimGenerate: () => createSafeLogMessage('toolConfigs=%o, options=%o'),
  shimToolConfigUndefined: () => createSafeLogMessage('toolConfig for %s is undefined. Skipping.'),
  shimGenerateForTool: () => createSafeLogMessage('toolName=%s, toolConfig=%o, options=%o, FileSystem: %s'),
  shimFilePath: () => createSafeLogMessage('shimFilePath=%s'),
  shimExists: () => createSafeLogMessage('Shim already exists at %s and overwrite is false. Skipping.'),
  shimToolBinPath: () => createSafeLogMessage('directBinaryPath=%s, extractedBinaryPath=%s'),
  shimContent: () => createSafeLogMessage('shimContent=\n%s'),
  shimWriting: () => createSafeLogMessage('Writing shim file to %s using %s'),
  shimMakingExecutable: () => createSafeLogMessage('Making shim executable: chmod +x %s using %s'),
  shimSuccess: () => createSafeLogMessage('Shim for %s generated successfully at %s (using %s).'),
} satisfies SafeLogMessageMap;
