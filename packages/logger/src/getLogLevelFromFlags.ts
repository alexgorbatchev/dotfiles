/**
 * Determines the appropriate log level based on CLI flags.
 *
 * @param quiet If true, only show errors and fatal messages (level 5)
 * @param verbose If true, show all messages including debug and trace (level 1)
 * @returns The appropriate log level (0=silly, 1=trace, 2=debug, 3=info, 4=warn, 5=error, 6=fatal)
 */

export function getLogLevelFromFlags(quiet: boolean, verbose: boolean): number {
  if (quiet) {
    return 5; // ERROR level - only show errors and fatal (5=error, 6=fatal)
  }
  if (verbose) {
    return 1; // TRACE level - show everything including debug and trace (1=trace, 2=debug, 3=info, etc.)
  }
  return 3; // INFO level - default (3=info, 4=warn, 5=error, 6=fatal)
}
