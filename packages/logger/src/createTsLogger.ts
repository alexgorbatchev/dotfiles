import { type ILogObj, type ILogObjMeta, type ISettingsParam, Logger } from 'tslog';
import type { ZodError } from 'zod';
import { formatZodErrors } from './formatZodErrors';
import { LogLevel, type LogLevelValue } from './LogLevel';
import type { SafeLogMessage } from './types';

export type TsLogger = SafeLogger<ILogObj>;

export interface LoggerConfig {
  name: string;
  level?: LogLevelValue;
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

  /**
   * Logs Zod validation errors in a readable format using error level logging.
   * @param error The Zod error object
   */
  zodErrors(error: ZodError): void {
    const messages = formatZodErrors(error);
    for (const message of messages) {
      this.error(message as SafeLogMessage);
    }
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
 * @param config.level Log level from LogLevel constants (TRACE, VERBOSE, DEFAULT, QUIET)
 * @returns SafeLogger instance that enforces type-safe logging
 */
export function createTsLogger(name: string): TsLogger;
export function createTsLogger(config: LoggerConfig): TsLogger;
export function createTsLogger(configOrName: LoggerConfig | string): TsLogger {
  let config: LoggerConfig = {} as LoggerConfig;

  if (typeof configOrName === 'string') {
    config.name = configOrName;
  } else {
    config = { ...configOrName };
  }

  config.level = config.level ?? LogLevel.DEFAULT;

  const prettyLogTemplate =
    // here if trace, we will add more details
    config.level === LogLevel.TRACE
      ? // add full name in verbose mode
        '{{logLevelName}}\t{{filePathWithLine}} - '
      : // for all other levels this
        '{{logLevelName}}\t';

  return new SafeLogger({
    name: config.name,
    minLevel: config.level,
    prettyLogTemplate,

    hideLogPositionForProduction: false,

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

    prettyInspectOptions: {
      breakLength: Infinity,
      compact: true,
    },
  });
}
