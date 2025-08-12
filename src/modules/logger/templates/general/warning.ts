import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const generalWarningTemplates = {
  unsupportedOperation: (operation: string, details: string) => 
    createSafeLogMessage(`${operation} not yet supported (${details})`),
  operationSkipped: (operation: string, reason: string) => 
    createSafeLogMessage(`${operation} skipped: ${reason}`),
} satisfies SafeLogMessageMap;