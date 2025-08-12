import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const shimDebugTemplates = {
  constructorDebug: (): SafeLogMessage => createSafeLogMessage('fileSystem=%o, config=%o'),
  generateDebug: (): SafeLogMessage => createSafeLogMessage('toolConfigs=%o, options=%o'),
  toolConfigUndefined: (): SafeLogMessage => createSafeLogMessage('toolConfig for %s is undefined. Skipping.'),
  generateForToolDebug: (): SafeLogMessage =>
    createSafeLogMessage('toolName=%s, toolConfig=%o, options=%o, FileSystem: %s'),
  shimFilePath: (): SafeLogMessage => createSafeLogMessage('shimFilePath=%s'),
  shimExists: (): SafeLogMessage => createSafeLogMessage('Shim already exists at %s and overwrite is false. Skipping.'),
  toolBinPath: (): SafeLogMessage => createSafeLogMessage('directBinaryPath=%s, extractedBinaryPath=%s'),
  shimContent: (): SafeLogMessage => createSafeLogMessage('shimContent=\n%s'),
  writingShim: (): SafeLogMessage => createSafeLogMessage('Writing shim file to %s using %s'),
  makingExecutable: (): SafeLogMessage => createSafeLogMessage('Making shim executable: chmod +x %s using %s'),
  shimSuccess: (): SafeLogMessage => createSafeLogMessage('Shim for %s generated successfully at %s (using %s).'),
} as const;
