import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const shellInitDebugTemplates = {
  constructorDebug: () => createSafeLogMessage('fileSystem=%o, config=%o'),
  generateDebug: () => createSafeLogMessage('toolConfigs=%o, options=%o'),
  processingTool: () => createSafeLogMessage('Processing shell init for tool: %s'),
  shellScriptGenerated: () => createSafeLogMessage('Generated %s shell script: %d lines'),
  writingShellScript: () => createSafeLogMessage('Writing shell script to: %s'),
  shellInitComplete: () => createSafeLogMessage('Shell initialization complete: %d tools processed'),
  outputPath: () => createSafeLogMessage('outputPath=%s'),
  skippingUndefined: () => createSafeLogMessage('skipping undefined config for toolName=%s'),
  writingFile: () => createSafeLogMessage('Writing to %s using %s with content:\n%s'),
  writeSuccess: () => createSafeLogMessage('Successfully wrote Zsh init file to %s using %s'),
  writeError: () => createSafeLogMessage('ERROR: Failed to write Zsh init file to %s using %s. Error: %s'),
  processCompletions: () => createSafeLogMessage('toolName=%s, completions=%o'),
  fpathAdded: () => createSafeLogMessage('Added %s to fpath for tool %s'),
  updatingProfiles: () => createSafeLogMessage('Updating profile files with configs: %o'),
} satisfies SafeLogMessageMap;
