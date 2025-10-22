import type { SafeLogMessage } from './types';

/**
 * Type guard to check if a value is a SafeLogMessage
 */

export function isSafeLogMessage(value: unknown): value is SafeLogMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__brand' in value &&
    (value as { __brand: unknown }).__brand === 'SafeLogMessage'
  );
}
