import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const hookExecutorDebugTemplates = {
  constructorDebug: (): SafeLogMessage => 
    createSafeLogMessage('fileSystem=%o, logger=%o'),
  executeDebug: (): SafeLogMessage => 
    createSafeLogMessage('hookType=%s, toolName=%s, context=%o'),
  hookFound: (): SafeLogMessage => 
    createSafeLogMessage('Found %s hook for tool %s'),
  hookNotFound: (): SafeLogMessage => 
    createSafeLogMessage('No %s hook found for tool %s'),
  hookStart: (): SafeLogMessage => 
    createSafeLogMessage('Executing %s hook for %s'),
  hookComplete: (): SafeLogMessage => 
    createSafeLogMessage('Hook %s completed for %s in %dms'),
  hookSkipped: (): SafeLogMessage => 
    createSafeLogMessage('Hook %s skipped for %s: %s'),
  executingHook: (): SafeLogMessage => 
    createSafeLogMessage('Executing %s hook with %dms timeout'),
  hookCompleted: (): SafeLogMessage => 
    createSafeLogMessage('Hook %s completed successfully in %dms'),
  continuingDespiteFailure: (): SafeLogMessage => 
    createSafeLogMessage('Continuing installation despite %s hook failure'),
  stoppingDueToFailure: (): SafeLogMessage => 
    createSafeLogMessage('Stopping hook execution due to failure in %s hook'),
} as const;