import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const symlinkDebugTemplates = {
  constructorInit: (): SafeLogMessage => 
    createSafeLogMessage('SymlinkGenerator initialized'),
  generateStart: (): SafeLogMessage => 
    createSafeLogMessage('Starting symlink generation. Options: %o, FileSystem: %s'),
  toolConfigUndefined: (): SafeLogMessage => 
    createSafeLogMessage('Tool config for "%s" is undefined. Skipping.'),
  noSymlinks: (): SafeLogMessage => 
    createSafeLogMessage('Tool "%s" has no symlinks defined, skipping.'),
  processingTool: (): SafeLogMessage => 
    createSafeLogMessage('Processing symlinks for tool "%s"'),
  processingSymlink: (): SafeLogMessage => 
    createSafeLogMessage('Processing symlink: source="%s" (abs: "%s"), target="%s" (abs: "%s")'),
  targetExists: (): SafeLogMessage => 
    createSafeLogMessage('Target path "%s" already exists.'),
  skipTargetExists: (): SafeLogMessage => 
    createSafeLogMessage('Target "%s" exists and overwrite is false. Skipping symlink creation.'),
  backupAttempt: (): SafeLogMessage => 
    createSafeLogMessage('Backup option enabled. Attempting to rename "%s" to "%s" using %s.'),
  backupSuccess: (): SafeLogMessage => 
    createSafeLogMessage('Successfully backed up "%s" to "%s" using %s.'),
  overwriteDelete: (): SafeLogMessage => 
    createSafeLogMessage('Overwrite enabled. Attempting to delete "%s" using %s.'),
  deleteSuccess: (): SafeLogMessage => 
    createSafeLogMessage('Successfully deleted "%s" for overwrite using %s.'),
  ensureDir: (): SafeLogMessage => 
    createSafeLogMessage('Ensuring target directory "%s" exists using %s.'),
  symlinkAttempt: (): SafeLogMessage => 
    createSafeLogMessage('Attempting to create symlink from "%s" to "%s" using %s.'),
  symlinkSuccess: (): SafeLogMessage => 
    createSafeLogMessage('Successfully created symlink from "%s" to "%s" using %s.'),
  generationComplete: (): SafeLogMessage => 
    createSafeLogMessage('Symlink generation process completed. Results: %o'),
} as const;