import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from './utils';

export const hookExecutorDebugTemplates = {
  executingHook: (): SafeLogMessage => 
    createSafeLogMessage('Executing %s hook with %dms timeout'),
  hookCompleted: (): SafeLogMessage => 
    createSafeLogMessage('Hook %s completed successfully in %dms'),
  continuingDespiteFailure: (): SafeLogMessage => 
    createSafeLogMessage('Continuing installation despite %s hook failure'),
  stoppingDueToFailure: (): SafeLogMessage => 
    createSafeLogMessage('Stopping hook execution due to failure in %s hook'),
} as const;