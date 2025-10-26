/**
 * Log levels for controlling the verbosity of output.
 *
 * Each level corresponds to a specific tslog level number:
 * - TRACE: 0 (most verbose - shows all messages)
 * - VERBOSE: 1 (debug level - shows debug, info, warn, error, fatal)
 * - DEFAULT: 3 (info level - shows info, warn, error, fatal)
 * - QUIET: 5 (error level - shows only error and fatal)
 */
export const LogLevel = {
  TRACE: 0,
  VERBOSE: 1,
  DEFAULT: 3,
  QUIET: 5,
} as const;

export type LogLevelValue = (typeof LogLevel)[keyof typeof LogLevel];

/**
 * Valid string representations of log levels for CLI parsing.
 */
export const LOG_LEVEL_NAMES = ['trace', 'verbose', 'default', 'quiet'] as const;
export type LogLevelName = (typeof LOG_LEVEL_NAMES)[number];

/**
 * Maps log level names to their numeric values.
 */
export const LOG_LEVEL_MAP: Record<LogLevelName, LogLevelValue> = {
  trace: LogLevel.TRACE,
  verbose: LogLevel.VERBOSE,
  default: LogLevel.DEFAULT,
  quiet: LogLevel.QUIET,
};

/**
 * Parses a log level name string to its numeric value.
 *
 * @param levelName The log level name to parse
 * @returns The numeric log level
 * @throws Error if the level name is invalid
 */
export function parseLogLevel(levelName: string): LogLevelValue {
  const normalizedName = levelName.toLowerCase() as LogLevelName;

  if (!(normalizedName in LOG_LEVEL_MAP)) {
    throw new Error(`Invalid log level: ${levelName}. Valid levels are: ${LOG_LEVEL_NAMES.join(', ')}`);
  }

  return LOG_LEVEL_MAP[normalizedName];
}
