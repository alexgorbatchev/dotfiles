import { type ILogObj, type ILogObjMeta, type ISettingsParam, Logger } from 'tslog';
import type { ZodError } from 'zod';
import { formatZodErrors } from './formatZodErrors';
import { LogLevel, type LogLevelValue } from './LogLevel';
import type { SafeLogMessage } from './types';

/**
 * A type alias for a {@link SafeLogger} instance with a default log object type.
 * @public
 */
export type TsLogger = SafeLogger<ILogObj>;

/**
 * Configuration options for creating a logger instance.
 * @public
 */
export interface LoggerConfig {
  /**
   * The name of the logger, which will be included in log messages.
   */
  name: string;
  /**
   * The minimum log level to be processed.
   * @default LogLevel.DEFAULT
   */
  level?: LogLevelValue;
}

/**
 * A type-safe logger that extends `tslog`'s `Logger` to enforce the use of
 * {@link SafeLogMessage} objects for all log messages.
 *
 * This class prevents raw strings from being passed to log methods, ensuring
 * that all logged messages are constructed through approved template functions.
 *
 * @public
 */
class SafeLogger<LogObj = unknown> extends Logger<LogObj> {
  /**
   * @inheritdoc
   */
  override trace(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.trace(message as string, ...args);
  }

  /**
   * @inheritdoc
   */
  override debug(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.debug(message as string, ...args);
  }

  /**
   * @inheritdoc
   */
  override info(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.info(message as string, ...args);
  }

  /**
   * @inheritdoc
   */
  override warn(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.warn(message as string, ...args);
  }

  /**
   * @inheritdoc
   */
  override error(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.error(message as string, ...args);
  }

  /**
   * @inheritdoc
   */
  override fatal(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.fatal(message as string, ...args);
  }

  /**
   * @inheritdoc
   */
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
   * Logs Zod validation errors in a readable format using the `error` log level.
   * @param error - The `ZodError` object to log.
   */
  zodErrors(error: ZodError): void {
    const messages = formatZodErrors(error);
    for (const message of messages) {
      this.error(message as SafeLogMessage);
    }
  }
}

/**
 * Creates a type-safe `tslog` logger instance with a configurable name and log level.
 *
 * The returned {@link SafeLogger} only accepts {@link SafeLogMessage} objects as the
 * first argument to its log methods, preventing arbitrary strings from being
 * logged. This ensures that all log messages are constructed through
 * predefined template functions.
 *
 * @param name - The name of the logger.
 * @returns A {@link TsLogger} instance.
 *
 * @example
 * ```typescript
 * import { createTsLogger, messages } from '@dotfiles/logger';
 *
 * const logger = createTsLogger('my-app');
 * logger.info(messages.info.appStarted());
 * ```
 *
 * @public
 */
export function createTsLogger(name: string): TsLogger;
/**
 * Creates a type-safe `tslog` logger instance with a configurable name and log level.
 *
 * The returned {@link SafeLogger} only accepts {@link SafeLogMessage} objects as the
 * first argument to its log methods, preventing arbitrary strings from being
 * logged. This ensures that all log messages are constructed through
 * predefined template functions.
 *
 * @param config - The logger configuration.
 * @returns A {@link TsLogger} instance.
 *
 * @example
 * ```typescript
 * import { createTsLogger, LogLevel, messages } from '@dotfiles/logger';
 *
 * const logger = createTsLogger({ name: 'my-app', level: LogLevel.VERBOSE });
 * logger.debug(messages.debug.configLoaded({ config: { setting: 'value' } }));
 * ```
 *
 * @public
 */
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
