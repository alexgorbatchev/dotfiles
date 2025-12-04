import { type ILogObjMeta, type ISettingsParam, Logger } from 'tslog';
import type { ZodError } from 'zod';
import { formatZodErrors } from './formatZodErrors';
import type { SafeLogMessage } from './types';

/**
 * A type-safe logger that extends `tslog`'s `Logger` to enforce the use of
 * {@link SafeLogMessage} objects for all log messages.
 *
 * This class prevents raw strings from being passed to log methods, ensuring
 * that all logged messages are constructed through approved template functions.
 *
 * @public
 */
export class SafeLogger<LogObj = unknown> extends Logger<LogObj> {
  /** @inheritdoc */
  override trace(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.trace(message as string, ...args);
  }

  /** @inheritdoc */
  override debug(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.debug(message as string, ...args);
  }

  /** @inheritdoc */
  override info(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.info(message as string, ...args);
  }

  /** @inheritdoc */
  override warn(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.warn(message as string, ...args);
  }

  /** @inheritdoc */
  override error(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.error(message as string, ...args);
  }

  /** @inheritdoc */
  override fatal(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.fatal(message as string, ...args);
  }

  /** @inheritdoc */
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
