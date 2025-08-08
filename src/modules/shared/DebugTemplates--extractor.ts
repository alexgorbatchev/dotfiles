import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from './utils';

export const extractorDebugTemplates = {
  extractStarted: (): SafeLogMessage => 
    createSafeLogMessage('Extracting %s using format %s'),
  formatDetected: (): SafeLogMessage => 
    createSafeLogMessage('Detected archive format: %s for file: %s'),
  extractionCompleted: (): SafeLogMessage => 
    createSafeLogMessage('Extraction completed in %s ms'),
  fileExecutableCheck: (): SafeLogMessage => 
    createSafeLogMessage('Checking if file is executable: %s'),
  commandExecution: (): SafeLogMessage => 
    createSafeLogMessage('Executing command: %s'),
  fileContent: (): SafeLogMessage => 
    createSafeLogMessage('File content preview (first 200 bytes): %s'),
  executionResult: (): SafeLogMessage => 
    createSafeLogMessage('Command result: stdout=%s, stderr=%s'),
  commandError: (): SafeLogMessage => 
    createSafeLogMessage('executeShellCommand error: %o'),
  fileCommandFailed: (): SafeLogMessage => 
    createSafeLogMessage('"file" command failed during fallback. Error: %o'),
  extractingArchive: (): SafeLogMessage => 
    createSafeLogMessage('Extracting %s to %s using format %s'),
  extractionTime: (): SafeLogMessage => 
    createSafeLogMessage('Extraction took %d ms'),
  findingExecutables: (): SafeLogMessage => 
    createSafeLogMessage('Finding executable files in %s'),
  checkingExecutable: (): SafeLogMessage => 
    createSafeLogMessage('Checking if %s is executable'),
  executableDetails: (): SafeLogMessage => 
    createSafeLogMessage('File %s - size: %d, isExecutable: %s'),
  zipStripComponents: (): SafeLogMessage => 
    createSafeLogMessage('--strip-components is not directly supported for zip, files will be extracted with full paths into target.'),
  debugArchivePath: (): SafeLogMessage => 
    createSafeLogMessage('archivePath=%s, options=%o'),
  extractErrorCleanup: (): SafeLogMessage => 
    createSafeLogMessage('Error during extract process, cleaning up temp dir: %s. Error: %o'),
  cleanupError: (): SafeLogMessage => 
    createSafeLogMessage('Error during cleanup of temp dir after an error: %o'),
  settingExecutable: (): SafeLogMessage => 
    createSafeLogMessage('Setting +x for %s'),
  fileStatError: (): SafeLogMessage => 
    createSafeLogMessage('Error stating or chmoding file %s: %o'),
} as const;