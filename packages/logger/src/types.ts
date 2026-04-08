import type { ILogObj } from "tslog";
import type { LogLevelValue } from "./LogLevel";
import type { SafeLogger } from "./SafeLogger";

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
 */
export type SafeLogMessage = string & {
  readonly __brand: "SafeLogMessage";
};

/**
 * A type representing a map of functions that generate {@link SafeLogMessage}s.
 *
 * This is typically used to define a collection of log message templates.
 * The `any[]` is intentional to support message factories with varying parameter types.
 */
// oxlint-disable-next-line no-explicit-any -- Generic message factory type requires flexible parameter signature
export type SafeLogMessageMap = Record<string, (...args: any[]) => SafeLogMessage>;

/**
 * A type alias for a {@link SafeLogger} instance with a default log object type.
 */
export type TsLogger = SafeLogger<ILogObj>;

/**
 * Configuration options for creating a logger instance.
 */
export interface ILoggerConfig {
  /**
   * The name of the logger, which will be included in log messages.
   */
  name: string;
  /**
   * The minimum log level to be processed.
   * @default LogLevel.DEFAULT
   */
  level?: LogLevelValue;
  /**
   * Whether to include source file paths and line numbers in log output.
   * @default false
   */
  trace?: boolean;
}
