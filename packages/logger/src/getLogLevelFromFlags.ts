import { LogLevel, type LogLevelValue, parseLogLevel } from "./LogLevel";

/**
 * Determines the appropriate log level based on command-line flags.
 *
 * This function interprets a combination of `--log`, `--quiet`, and `--verbose`
 * flags to determine the final log level. The `--quiet` and `--verbose` flags
 * act as aliases for `--log=quiet` and `--log=verbose`, respectively, and take
 * precedence over the `--log` flag.
 *
 * @param log - The value of the `--log` flag (e.g., 'default', 'verbose').
 * @param quiet - A boolean indicating if the `--quiet` flag is present.
 * @param verbose - A boolean indicating if the `--verbose` flag is present.
 * @returns The appropriate {@link LogLevelValue}.
 *
 * @example
 * ```typescript
 * import { getLogLevelFromFlags, LogLevel } from '@dotfiles/logger';
 *
 * // --quiet flag is present
 * getLogLevelFromFlags('default', true, false); // LogLevel.QUIET
 *
 * // --verbose flag is present
 * getLogLevelFromFlags('default', false, true); // LogLevel.VERBOSE
 * ```
 *
 * @see {@link LogLevel}
 * @see {@link parseLogLevel}
 */
export function getLogLevelFromFlags(log: string, quiet: boolean, verbose: boolean): LogLevelValue {
  // Handle alias flags first
  if (quiet) {
    return LogLevel.QUIET;
  }
  if (verbose) {
    return LogLevel.VERBOSE;
  }

  // Parse the --log flag value
  return parseLogLevel(log);
}
