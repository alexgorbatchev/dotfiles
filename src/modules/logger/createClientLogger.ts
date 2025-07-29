import { createConsola, LogLevels, type LogLevel } from 'consola';

export interface CreateClientLoggerOptions {
  quiet?: boolean;
  verbose?: boolean; // This will be used by the CLI to decide if it should call logger.debug()
}

/**
 * Creates a new client logger instance using @node-cli/logger.
 * The actual logging level (info vs debug) is determined by which method
 * is called on the logger instance by the CLI (e.g., logger.info() vs logger.debug()).
 * This function primarily configures the logger's silence.
 *
 * @param options - Configuration options for the logger.
 * @returns A configured logger instance.
 */
/**
 * Creates a new client logger instance using `consola`.
 *
 * This function configures the logger's verbosity and silence settings based on
 * the provided options and the `NODE_ENV` environment variable. The actual logging
 * level (e.g., `info` vs. `debug`) is determined by which method is called on the
 * logger instance by the CLI.
 *
 * @param options - Configuration options for the logger.
 * @returns A configured `consola` instance.
 *
 * @testing
 * A testing helper is available to create a mock client logger for tests.
 * @see {@link createMockClientLogger} in `src/testing-helpers/createMockClientLogger.ts`
 */
export function createClientLogger(options: CreateClientLoggerOptions = {}) {
  const { quiet = false } = options; // Default quiet to false if not provided
  // The 'verbose' option from CreateClientLoggerOptions is not directly used to set a level
  // on the Logger instance itself. Instead, the CLI will use the 'verbose' flag
  // to decide whether to call logger.debug() (if verbose) or logger.info() (if not verbose).

  // Determine if the logger should be silent:
  // 1. If 'quiet' is explicitly true, it's silent.
  // 2. If running in 'test' environment AND 'quiet' is not explicitly set to false,
  //    it's silent (i.e., tests are silent by default but can be made non-silent).
  let level: LogLevel = LogLevels.info;

  if (options.verbose) {
    level = LogLevels.debug;
  }

  if (process.env.NODE_ENV === 'test' || quiet) {
    level = LogLevels.silent;
  }

  return createConsola({
    formatOptions: {
      date: false,
    },
    level,
  });
}
