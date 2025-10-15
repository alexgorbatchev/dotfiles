import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '@modules/logger/utils';

export const fileRegistryLogMessages = {
  trackedFsCreated: () => createSafeLogMessage('Created tracked filesystem for tool: %s'),
  directoryDeletionError: () => createSafeLogMessage('Error tracking directory deletion %s: %s'),
  rmdirTracked: () => createSafeLogMessage('Tracked rmdir operation: %s'),
  operationRecorded: () => createSafeLogMessage('Recorded %s operation for %s: %s'),
  operationsRetrieved: () => createSafeLogMessage('Retrieved %d operations with filter: %o'),
  fileStatesComputed: () => createSafeLogMessage('Computed %d file states for tool: %s'),
  fileStateComputed: () => createSafeLogMessage('Computed file state for %s: %s'),
  noOperationsFound: () => createSafeLogMessage('No operations found for file: %s'),
  toolsFound: () => createSafeLogMessage('Found %d registered tools'),
  operationsRemoved: () => createSafeLogMessage('Removed %d operations for tool: %s'),
  compactionComplete: () => createSafeLogMessage('Compaction complete: %d -> %d operations'),
  validationComplete: () => createSafeLogMessage('Validation complete: %d issues found, %d repaired'),
  registryClosed: () => createSafeLogMessage('Closed SQLite file registry'),
  schemaInitialized: () => createSafeLogMessage('Schema initialization complete'),
  fileCreated: (toolName: string, path: string) => createSafeLogMessage(`[${toolName}] write ${path}`),
  fileUpdated: (toolName: string, path: string) => createSafeLogMessage(`[${toolName}] write ${path}`),
  fileRemoved: (toolName: string, path: string) => createSafeLogMessage(`[${toolName}] rm ${path}`),
  fileMoved: (toolName: string, oldPath: string, newPath: string) =>
    createSafeLogMessage(`[${toolName}] mv ${oldPath} ${newPath}`),
  fileCopied: (toolName: string, srcPath: string, destPath: string) =>
    createSafeLogMessage(`[${toolName}] cp ${srcPath} ${destPath}`),
  symlinkCreated: (toolName: string, linkPath: string, targetPath: string) =>
    createSafeLogMessage(`[${toolName}] ln -s ${targetPath} ${linkPath}`),
  permissionsChanged: (toolName: string, path: string, mode: string) =>
    createSafeLogMessage(`[${toolName}] chmod ${mode} ${path}`),
  directoryCreated: (toolName: string, path: string) => createSafeLogMessage(`[${toolName}] mkdir ${path}`),
} satisfies SafeLogMessageMap;
