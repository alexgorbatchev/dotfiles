import type { SafeLogMessage } from './types';

/**
 * Creates a `SafeLogMessage`, a branded type that represents a string that is
 * safe for logging and does not contain sensitive information.
 *
 * This function should only be used within template functions that are
 * responsible for constructing log messages. It serves as a type assertion to
 * indicate that the message has been properly sanitized or constructed.
 *
 * @param message - The string to be branded as a `SafeLogMessage`.
 * @returns The message as a {@link SafeLogMessage}.
 *
 * @example
 * ```typescript
 * import { createSafeLogMessage } from '@dotfiles/logger';
 *
 * function userLoginMessage(userId: string) {
 *   // In a real-world scenario, you would ensure that userId is not sensitive
 *   // or that it is properly anonymized before creating the message.
 *   return createSafeLogMessage(`User ${userId} logged in.`);
 * }
 * ```
 *
 * @see {@link SafeLogMessage}
 * @see {@link isSafeLogMessage}
 *
 * @public
 */
export function createSafeLogMessage(message: string): SafeLogMessage {
  return message as SafeLogMessage;
}
