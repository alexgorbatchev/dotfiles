import type { SafeLogMessage } from './types';

/**
 * This helper should only be used within template functions.
 */

export function createSafeLogMessage(message: string): SafeLogMessage {
  return message as SafeLogMessage;
}
