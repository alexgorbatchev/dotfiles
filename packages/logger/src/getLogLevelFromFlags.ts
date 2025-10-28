import { LogLevel, type LogLevelValue, parseLogLevel } from './LogLevel';

/**
 * Determines the appropriate log level based on CLI flags.
 *
 * @param log The log level string from --log flag (default: 'default')
 * @param quiet If true, only show errors and fatal messages (alias for --log=quiet)
 * @param verbose If true, show all messages including debug and trace (alias for --log=verbose)
 * @returns The appropriate LogLevel value
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
