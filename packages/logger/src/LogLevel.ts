/**
 * Defines the log levels for controlling the verbosity of application output.
 *
 * Each level corresponds to a specific `tslog` level number, determining which
 * messages are displayed based on their severity.
 *
 * @property TRACE - Level 0: The most verbose level, showing all messages.
 * @property VERBOSE - Level 1: Equivalent to a debug level, showing debug, info, warn, error, and fatal messages.
 * @property DEFAULT - Level 3: The standard info level, showing info, warn, error, and fatal messages.
 * @property QUIET - Level 5: The error level, showing only error and fatal messages.
 *
 * @example
 * ```typescript
 * import { LogLevel } from '@dotfiles/logger';
 *
 * const logLevel = LogLevel.VERBOSE;
 * ```
 */
export const LogLevel = {
  TRACE: 0,
  VERBOSE: 1,
  DEFAULT: 3,
  QUIET: 5,
} as const;

/**
 * Represents the numeric value of a log level.
 */
export type LogLevelValue = (typeof LogLevel)[keyof typeof LogLevel];

/**
 * Defines the valid string representations of log levels, typically used for
 * parsing command-line arguments or configuration values.
 */
export const LOG_LEVEL_NAMES = ['trace', 'verbose', 'default', 'quiet'] as const;

/**
 * A type representing the string name of a log level.
 */
export type LogLevelName = (typeof LOG_LEVEL_NAMES)[number];

/**
 * A mapping from log level names to their corresponding numeric values.
 *
 * @example
 * ```typescript
 * import { LOG_LEVEL_MAP } from '@dotfiles/logger';
 *
 * const logLevel = LOG_LEVEL_MAP['verbose']; // 1
 * ```
 */
export const LOG_LEVEL_MAP: Record<LogLevelName, LogLevelValue> = {
  trace: LogLevel.TRACE,
  verbose: LogLevel.VERBOSE,
  default: LogLevel.DEFAULT,
  quiet: LogLevel.QUIET,
};

/**
 * Parses a log level name string and returns its corresponding numeric value.
 *
 * The function is case-insensitive. If the provided name is not a valid log
 * level, it throws an error.
 *
 * @param levelName - The log level name to parse (e.g., 'trace', 'verbose').
 * @returns The numeric {@link LogLevelValue}.
 * @throws An `Error` if the `levelName` is invalid.
 *
 * @example
 * ```typescript
 * import { parseLogLevel } from '@dotfiles/logger';
 *
 * const logLevel = parseLogLevel('VERBOSE'); // 1
 * ```
 */
export function parseLogLevel(levelName: string): LogLevelValue {
  const normalizedName = levelName.toLowerCase() as LogLevelName;

  if (!(normalizedName in LOG_LEVEL_MAP)) {
    throw new Error(`Invalid log level: ${levelName}. Valid levels are: ${LOG_LEVEL_NAMES.join(', ')}`);
  }

  return LOG_LEVEL_MAP[normalizedName];
}
