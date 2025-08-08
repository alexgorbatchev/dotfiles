import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from './utils';

export const shellInitDebugTemplates = {
  constructorDebug: (): SafeLogMessage => 
    createSafeLogMessage('fileSystem=%o, appConfig=%o'),
  generateDebug: (): SafeLogMessage => 
    createSafeLogMessage('toolConfigs=%o, options=%o, FileSystem: %s'),
  outputPath: (): SafeLogMessage => 
    createSafeLogMessage('outputPath=%s'),
  processingTool: (): SafeLogMessage => 
    createSafeLogMessage('processing tool=%s, config=%o'),
  skippingUndefined: (): SafeLogMessage => 
    createSafeLogMessage('skipping undefined config for toolName=%s'),
  writingFile: (): SafeLogMessage => 
    createSafeLogMessage('Writing to %s using %s with content:\n%s'),
  writeSuccess: (): SafeLogMessage => 
    createSafeLogMessage('Successfully wrote Zsh init file to %s using %s'),
  writeError: (): SafeLogMessage => 
    createSafeLogMessage('ERROR: Failed to write Zsh init file to %s using %s. Error: %s'),
  processCompletions: (): SafeLogMessage => 
    createSafeLogMessage('toolName=%s, completions=%o'),
  fpathAdded: (): SafeLogMessage => 
    createSafeLogMessage('Added %s to fpath for tool %s'),
  updatingProfiles: (): SafeLogMessage => 
    createSafeLogMessage('Updating profile files with configs: %o'),
} as const;