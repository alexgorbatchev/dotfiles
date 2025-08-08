import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from './utils';

export const generalWarningTemplates = {
  unsupportedOperation: (operation: string, details: string): SafeLogMessage => 
    createSafeLogMessage(`${operation} not yet supported (${details})`),
} as const;