import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const extractorDebugTemplates = {
  constructorDebug: () => createSafeLogMessage('fileSystem=%o'),
  extractDebug: () => createSafeLogMessage('archivePath=%s, extractDir=%s, options=%o'),
  formatDetected: () => createSafeLogMessage('Detected archive format: %s for file %s'),
  extractionStart: () => createSafeLogMessage('Starting extraction of %s to %s'),
  extractionProgress: () => createSafeLogMessage('Extraction progress: %d files processed'),
  extractionComplete: () => createSafeLogMessage('Extraction completed: %d files extracted to %s'),

  extractStarted: () => createSafeLogMessage('Extracting %s using format %s'),
  extractionCompleted: () => createSafeLogMessage('Extraction completed in %s ms'),
  fileExecutableCheck: () => createSafeLogMessage('Checking if file is executable: %s'),
  commandExecution: () => createSafeLogMessage('Executing command: %s'),
  fileContent: () => createSafeLogMessage('File content preview (first 200 bytes): %s'),
  executionResult: () => createSafeLogMessage('Command result: stdout=%s, stderr=%s'),
  commandError: () => createSafeLogMessage('executeShellCommand error: %o'),
  fileCommandFailed: () => createSafeLogMessage('"file" command failed during fallback. Error: %o'),
  extractingArchive: () => createSafeLogMessage('Extracting %s to %s using format %s'),
  extractionTime: () => createSafeLogMessage('Extraction took %d ms'),
  findingExecutables: () => createSafeLogMessage('Finding executable files in %s'),
  checkingExecutable: () => createSafeLogMessage('Checking if %s is executable'),
  executableDetails: () => createSafeLogMessage('File %s - size: %d, isExecutable: %s'),
  zipStripComponents: () =>
    createSafeLogMessage(
      '--strip-components is not directly supported for zip, files will be extracted with full paths into target.'
    ),
  debugArchivePath: () => createSafeLogMessage('archivePath=%s, options=%o'),
  extractErrorCleanup: () => createSafeLogMessage('Error during extract process, cleaning up temp dir: %s. Error: %o'),
  cleanupError: () => createSafeLogMessage('Error during cleanup of temp dir after an error: %o'),
  settingExecutable: () => createSafeLogMessage('Setting +x for %s'),
  fileStatError: () => createSafeLogMessage('Error stating or chmoding file %s: %o'),
} satisfies SafeLogMessageMap;
