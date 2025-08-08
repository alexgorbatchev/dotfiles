import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from './utils';

export const operationSuccessTemplates = {
  completed: (operation: string, duration: number, itemCount?: number): SafeLogMessage => 
    createSafeLogMessage(`${operation} completed in ${duration}ms${itemCount ? ` (${itemCount} items)` : ''}`),
} as const;