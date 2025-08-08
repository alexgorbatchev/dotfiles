import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from './utils';

export const registryDebugTemplates = {
  initialized: (): SafeLogMessage => 
    createSafeLogMessage('Initialized SQLite file registry at: %s'),
  operationRecorded: (): SafeLogMessage => 
    createSafeLogMessage('Recorded %s operation for %s: %s'),
  operationsRetrieved: (): SafeLogMessage => 
    createSafeLogMessage('Retrieved %d operations with filter: %o'),
  fileStatesComputed: (): SafeLogMessage => 
    createSafeLogMessage('Computed %d file states for tool: %s'),
  toolsFound: (): SafeLogMessage => 
    createSafeLogMessage('Found %d registered tools'),
  operationsRemoved: (): SafeLogMessage => 
    createSafeLogMessage('Removed %d operations for tool: %s'),
  compactionComplete: (): SafeLogMessage => 
    createSafeLogMessage('Compaction complete: %d -> %d operations'),
  validationComplete: (): SafeLogMessage => 
    createSafeLogMessage('Validation complete: %d issues found, %d repaired'),
  noOperationsFound: (): SafeLogMessage => 
    createSafeLogMessage('No operations found for file: %s'),
  fileStateComputed: (): SafeLogMessage => 
    createSafeLogMessage('Computed file state for %s: %s'),
  registryClosed: (): SafeLogMessage => 
    createSafeLogMessage('Closed SQLite file registry'),
  schemaInitialized: (): SafeLogMessage => 
    createSafeLogMessage('Schema initialization complete'),
  trackedFsCreated: (): SafeLogMessage => 
    createSafeLogMessage('Created tracked filesystem for tool: %s'),
  rmdirTracked: (): SafeLogMessage => 
    createSafeLogMessage('Tracked rmdir operation: %s'),
  directoryDeletionError: (): SafeLogMessage => 
    createSafeLogMessage('Error tracking directory deletion %s: %s'),
} as const;