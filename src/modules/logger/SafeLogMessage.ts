/**
 * Branded string type for safe log messages.
 * Only messages created by ErrorTemplates or SuccessTemplates should have this brand.
 *
 * This is a branded string primitive that works transparently with all string operations
 * while maintaining type safety for logging.
 */
export type SafeLogMessage = string & {
  readonly __brand: 'SafeLogMessage';
};

export type SafeLogMessageMap = Record<string, (...args: any[]) => SafeLogMessage>;

/**
 * Type guard to check if a value is a SafeLogMessage
 */
export function isSafeLogMessage(value: unknown): value is SafeLogMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__brand' in value &&
    (value as any).__brand === 'SafeLogMessage'
  );
}
