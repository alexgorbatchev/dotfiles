import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const generalWarningTemplates = {
  unsupportedOperation: (operation: string, details: string) => 
    createSafeLogMessage(`${operation} not yet supported (${details})`),
} satisfies SafeLogMessageMap;