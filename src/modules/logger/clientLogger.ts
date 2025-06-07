/**
 * @fileoverview Provides a client logger utility using the @node-cli/logger package.
 *
 * ## Development Plan
 *
 * ### Intended Usage:
 * This module is intended to be used by the CLI to provide a consistent logging experience.
 * It allows for configuring the logger's verbosity and quietness.
 *
 * ### Technical Requirements:
 * - Export a function `createClientLogger` that accepts options for `quiet` and `verbose`.
 *
 * - The logger should be silent if `options.quiet` is true or `process.env.NODE_ENV === 'test'`.
 * - The logger should use `debug` level for verbose output and `info` for regular output.
 *
 * ### Tasks:
 * [x] Define the `createClientLogger` function signature and options type.
 * [x] Implement the logic to configure the logger based on options and `NODE_ENV`.
 * [ ] Write tests for the module.
 * [x] Cleanup all linting errors and warnings.
 * [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * [ ] Ensure 100% test coverage for executable code.
 * [ ] Update the memory bank with the new information when all tasks are complete.
 */
import { Logger } from '@node-cli/logger';

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
export function createClientLogger(options: CreateClientLoggerOptions = {}): Logger {
  const { quiet = false } = options; // Default quiet to false if not provided
  // The 'verbose' option from CreateClientLoggerOptions is not directly used to set a level
  // on the Logger instance itself. Instead, the CLI will use the 'verbose' flag
  // to decide whether to call logger.debug() (if verbose) or logger.info() (if not verbose).

  // Determine if the logger should be silent:
  // 1. If 'quiet' is explicitly true, it's silent.
  // 2. If running in 'test' environment AND 'quiet' is not explicitly set to false,
  //    it's silent (i.e., tests are silent by default but can be made non-silent).
  const defaultToSilentInTest = process.env.NODE_ENV === 'test' && options.quiet !== false;
  const isSilent = quiet || defaultToSilentInTest;

  const logger = new Logger({
    silent: isSilent,
    // According to the docs, other options like 'boring', 'prefix', 'timestamp' could be set here.
    // For now, only 'silent' is configured based on requirements.
  });

  return logger;
}
