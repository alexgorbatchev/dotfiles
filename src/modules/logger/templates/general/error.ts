import type { SafeLogMessageMap } from '@modules/logger/SafeLogMessage';
import { createSafeLogMessage } from '../../utils';

export const generalErrorTemplates = {
  operationFailed: (operation: string) => createSafeLogMessage(`${operation} failed`),
  invalidInput: (input: string, expected: string) =>
    createSafeLogMessage(`Invalid input "${input}", expected ${expected}`),
  unexpectedError: (operation: string, details: string) =>
    createSafeLogMessage(`Unexpected error during ${operation}: ${details}`),
} satisfies SafeLogMessageMap;
