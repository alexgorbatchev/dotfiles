import type { SafeLogMessage } from './types';

/**
 * A type guard to check if a value is a {@link SafeLogMessage}.
 *
 * This function checks for the presence and value of the `__brand` property
 * to determine if the given value is a `SafeLogMessage`.
 *
 * @param value - The value to check.
 * @returns `true` if the value is a `SafeLogMessage`, `false` otherwise.
 *
 * @example
 * ```typescript
 * import { isSafeLogMessage, createSafeLogMessage } from '@dotfiles/logger';
 *
 * const safeMessage = createSafeLogMessage('This is safe');
 * const unsafeMessage = 'This is not';
 *
 * isSafeLogMessage(safeMessage); // true
 * isSafeLogMessage(unsafeMessage); // false
 * ```
 *
 * @see {@link SafeLogMessage}
 * @see {@link createSafeLogMessage}
 *
 * @public
 */
export function isSafeLogMessage(value: unknown): value is SafeLogMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__brand' in value &&
    (value as { __brand: unknown }).__brand === 'SafeLogMessage'
  );
}
