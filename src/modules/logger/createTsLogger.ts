import { type ILogObj, type ILogObjMeta, type ISettingsParam, Logger } from 'tslog';
import type { SafeLogMessage } from './SafeLogMessage';

export type TsLogger = SafeLogger<ILogObj>;

export interface LoggerConfig {
  name: string;
  minLevel?: number;
}

/**
 * Type-safe logger that extends Logger and overrides methods to only accept SafeLogMessage objects.
 * This prevents raw strings from being passed to log methods.
 */
class SafeLogger<LogObj = unknown> extends Logger<LogObj> {
  override trace(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.trace(message as string, ...args);
  }

  override debug(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.debug(message as string, ...args);
  }

  override info(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.info(message as string, ...args);
  }

  override warn(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.warn(message as string, ...args);
  }

  override error(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.error(message as string, ...args);
  }

  override fatal(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.fatal(message as string, ...args);
  }

  override getSubLogger(settings?: ISettingsParam<LogObj>): SafeLogger<LogObj> {
    const parentNames = [...(this.settings.parentNames ?? [])];
    if (this.settings.name) {
      parentNames.push(this.settings.name);
    }

    return new SafeLogger({
      ...this.settings,
      ...settings,
      parentNames,
    });
  }
}

/**
 * Creates a type-safe TSLog logger instance with configurable log level.
 *
 * The returned SafeLogger only accepts SafeLogMessage objects as the first argument
 * to log methods, preventing arbitrary strings from being logged. Use ErrorTemplates
 * or SuccessTemplates to create safe log messages.
 *
 * @param config Logger configuration
 * @param config.name Logger name
 * @param config.minLevel Minimum log level (0=trace, 1=debug, 2=info, 3=warn, 4=error, 5=fatal)
 * @returns SafeLogger instance that enforces type-safe logging
 */
export function createTsLogger(config: LoggerConfig): TsLogger;
export function createTsLogger(name: string): TsLogger; // Backward compatibility overload

export function createTsLogger(configOrName: LoggerConfig | string): TsLogger {
  if (typeof configOrName === 'string') {
    // Backward compatibility: default to INFO level with user-friendly formatting
    return new SafeLogger({
      name: configOrName,
      minLevel: 3, // INFO level (0=silly, 1=trace, 2=debug, 3=info)
      ...getUserFriendlyLoggerSettings(),
    });
  }

  const { name, minLevel = 3 } = configOrName; // Default to INFO level
  return new SafeLogger({
    name,
    minLevel,
    ...getUserFriendlyLoggerSettings(),
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
