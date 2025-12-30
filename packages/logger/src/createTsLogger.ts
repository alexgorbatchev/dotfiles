import { LogLevel } from './LogLevel';
import { SafeLogger } from './SafeLogger';
import type { ILoggerConfig, TsLogger } from './types';

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
 */
export function createTsLogger(config: ILoggerConfig): TsLogger;
export function createTsLogger(configOrName: ILoggerConfig | string): TsLogger {
  let config: ILoggerConfig = {} as ILoggerConfig;

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
