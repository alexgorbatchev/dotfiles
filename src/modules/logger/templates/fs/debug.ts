import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const fsDebugTemplates = {
  // Symlink operations
  symlinkGeneratorInit: (): SafeLogMessage => 
    createSafeLogMessage('SymlinkGenerator initialized'),
  symlinkGenerateStart: (): SafeLogMessage => 
    createSafeLogMessage('Starting symlink generation. Options: %o, FileSystem: %s'),
  symlinkToolConfigUndefined: (): SafeLogMessage => 
    createSafeLogMessage('Tool config for "%s" is undefined. Skipping.'),
  symlinkNoSymlinks: (): SafeLogMessage => 
    createSafeLogMessage('Tool "%s" has no symlinks defined, skipping.'),
  symlinkProcessingTool: (): SafeLogMessage => 
    createSafeLogMessage('Processing symlinks for tool "%s"'),
  symlinkProcessing: (): SafeLogMessage => 
    createSafeLogMessage('Processing symlink: source="%s" (abs: "%s"), target="%s" (abs: "%s")'),
  symlinkTargetExists: (): SafeLogMessage => 
    createSafeLogMessage('Target path "%s" already exists.'),
  symlinkSkipTargetExists: (): SafeLogMessage => 
    createSafeLogMessage('Target "%s" exists and overwrite is false. Skipping symlink creation.'),
  symlinkBackupAttempt: (): SafeLogMessage => 
    createSafeLogMessage('Backup option enabled. Attempting to rename "%s" to "%s" using %s.'),
  symlinkBackupSuccess: (): SafeLogMessage => 
    createSafeLogMessage('Successfully backed up "%s" to "%s" using %s.'),
  symlinkOverwriteDelete: (): SafeLogMessage => 
    createSafeLogMessage('Overwrite enabled. Attempting to delete "%s" using %s.'),
  symlinkDeleteSuccess: (): SafeLogMessage => 
    createSafeLogMessage('Successfully deleted "%s" for overwrite using %s.'),
  symlinkEnsureDir: (): SafeLogMessage => 
    createSafeLogMessage('Ensuring target directory "%s" exists using %s.'),
  symlinkAttempt: (): SafeLogMessage => 
    createSafeLogMessage('Attempting to create symlink from "%s" to "%s" using %s.'),
  symlinkSuccess: (): SafeLogMessage => 
    createSafeLogMessage('Successfully created symlink from "%s" to "%s" using %s.'),
  symlinkGenerationComplete: (): SafeLogMessage => 
    createSafeLogMessage('Symlink generation process completed. Results: %o'),

  // Shim operations  
  shimConstructor: (): SafeLogMessage => 
    createSafeLogMessage('fileSystem=%o, config=%o'),
  shimGenerate: (): SafeLogMessage => 
    createSafeLogMessage('toolConfigs=%o, options=%o'),
  shimToolConfigUndefined: (): SafeLogMessage => 
    createSafeLogMessage('toolConfig for %s is undefined. Skipping.'),
  shimGenerateForTool: (): SafeLogMessage => 
    createSafeLogMessage('toolName=%s, toolConfig=%o, options=%o, FileSystem: %s'),
  shimFilePath: (): SafeLogMessage => 
    createSafeLogMessage('shimFilePath=%s'),
  shimExists: (): SafeLogMessage => 
    createSafeLogMessage('Shim already exists at %s and overwrite is false. Skipping.'),
  shimToolBinPath: (): SafeLogMessage => 
    createSafeLogMessage('directBinaryPath=%s, extractedBinaryPath=%s'),
  shimContent: (): SafeLogMessage => 
    createSafeLogMessage('shimContent=\n%s'),
  shimWriting: (): SafeLogMessage => 
    createSafeLogMessage('Writing shim file to %s using %s'),
  shimMakingExecutable: (): SafeLogMessage => 
    createSafeLogMessage('Making shim executable: chmod +x %s using %s'),
  shimSuccess: (): SafeLogMessage => 
    createSafeLogMessage('Shim for %s generated successfully at %s (using %s).'),
} as const;