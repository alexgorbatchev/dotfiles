import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const shellInitDebugTemplates = {
  constructorDebug: (): SafeLogMessage => 
    createSafeLogMessage('fileSystem=%o, config=%o'),
  generateDebug: (): SafeLogMessage => 
    createSafeLogMessage('toolConfigs=%o, options=%o'),
  processingTool: (): SafeLogMessage => 
    createSafeLogMessage('Processing shell init for tool: %s'),
  shellScriptGenerated: (): SafeLogMessage => 
    createSafeLogMessage('Generated %s shell script: %d lines'),
  writingShellScript: (): SafeLogMessage => 
    createSafeLogMessage('Writing shell script to: %s'),
  shellInitComplete: (): SafeLogMessage => 
    createSafeLogMessage('Shell initialization complete: %d tools processed'),
  outputPath: (): SafeLogMessage => 
    createSafeLogMessage('outputPath=%s'),
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