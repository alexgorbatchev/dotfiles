import { Logger as TSLogger, type Logger as TSLoggerType } from 'tslog';

export type TsLogger = TSLoggerType<any>;

export interface LoggerConfig {
  name: string;
  minLevel?: number;
}

/**
 * Creates a TSLog logger instance with configurable log level.
 * 
 * @param config Logger configuration
 * @param config.name Logger name
 * @param config.minLevel Minimum log level (0=trace, 1=debug, 2=info, 3=warn, 4=error, 5=fatal)
 * @returns TsLogger instance
 */
export function createTsLogger(config: LoggerConfig): TsLogger;
export function createTsLogger(name: string): TsLogger; // Backward compatibility overload

export function createTsLogger(configOrName: LoggerConfig | string): TsLogger {
  if (typeof configOrName === 'string') {
    // Backward compatibility: default to INFO level with user-friendly formatting
    return new TSLogger({ 
      name: configOrName,
      minLevel: 3, // INFO level (0=silly, 1=trace, 2=debug, 3=info)
      ...getUserFriendlyLoggerSettings()
    });
  }
  
  const { name, minLevel = 3 } = configOrName; // Default to INFO level
  return new TSLogger({ 
    name,
    minLevel,
    ...getUserFriendlyLoggerSettings()
  });
}

/**
 * Returns user-friendly logger settings for public-facing output.
 * Shows clean format: "LEVEL message" without timestamps, file paths, etc.
 */
function getUserFriendlyLoggerSettings() {
  return {
    hideLogPositionForProduction: true,
    prettyLogTemplate: '{{logLevelName}}\t',
    prettyErrorTemplate: '\n{{errorName}} {{errorMessage}}\nerror stack:\n{{errorStack}}',
    prettyLogStyles: {
      logLevelName: {
        FATAL: ['bold', 'red'],
        ERROR: ['bold', 'red'], 
        WARN: ['bold', 'yellow'],
        INFO: ['bold', 'blue'],
        DEBUG: ['bold', 'white'],
        TRACE: ['bold', 'white'],
      },
    },
  };
}

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
