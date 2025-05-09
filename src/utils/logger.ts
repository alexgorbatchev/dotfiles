import debug from 'debug';

// Define a type for the logger function for better type safety
export type Logger = debug.Debugger;

/**
 * Creates a namespaced logger instance.
 * All loggers will have the "dot:" prefix.
 * @param name The specific namespace for this logger (e.g., 'installTool', 'fileUtils').
 * @returns A debug logger instance.
 */
export function createLogger(name: string): Logger {
  const logger = debug(`dot:${name}`);

  // Optional: Customize logger behavior here if needed,
  // e.g., how large objects are formatted, though debug handles much of this.
  // For example, to ensure all arguments are processed by debug's formatting:
  // const originalLog = logger.log;
  // logger.log = (...args: any[]) => {
  //   return originalLog.apply(logger, args);
  // };

  return logger;
}
