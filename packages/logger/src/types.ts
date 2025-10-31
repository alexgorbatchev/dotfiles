/**
 * A branded string type that represents a message that is safe for logging.
 *
 * This type is used to ensure that only messages constructed through approved
 * template functions are passed to the logger. It helps prevent accidental
 * logging of sensitive information by enforcing a type-safe contract at the
 * logger's interface.
 *
 * A `SafeLogMessage` is a string with a `__brand` property, which allows it to
 * be distinguished from regular strings at compile time.
 *
 * @see {@link createSafeLogMessage}
 * @see {@link isSafeLogMessage}
 *
 * @public
 */
export type SafeLogMessage = string & {
  readonly __brand: 'SafeLogMessage';
};

/**
 * A type representing a map of functions that generate {@link SafeLogMessage}s.
 *
 * This is typically used to define a collection of log message templates.
 *
 * @public
 */
// biome-ignore lint/suspicious/noExplicitAny: Template functions need varying parameter types
export type SafeLogMessageMap = Record<string, (...args: any[]) => SafeLogMessage>;
