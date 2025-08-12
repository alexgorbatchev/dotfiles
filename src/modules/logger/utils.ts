import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';

/**
 * Internal function to create SafeLogMessage objects.
 * This should only be used within template functions.
 */
export function createSafeLogMessage(message: string): SafeLogMessage {
  return message as SafeLogMessage;
}
