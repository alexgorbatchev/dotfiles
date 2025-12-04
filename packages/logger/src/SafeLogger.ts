import { type ILogObjMeta, type ISettingsParam, Logger } from 'tslog';
import type { ZodError } from 'zod';
import { formatZodErrors } from './formatZodErrors';
import type { SafeLogMessage } from './types';

/**
 * Extended settings for SafeLogger that adds context support.
 * @public
 */
export interface ISafeLoggerSettings<LogObj> extends ISettingsParam<LogObj> {
  /**
   * A context string to prepend to log messages as `[context]`.
   * Multiple contexts from parent loggers are chained together.
   */
  context?: string;
}

/**
 * A type-safe logger that extends `tslog`'s `Logger` to enforce the use of
 * {@link SafeLogMessage} objects for all log messages.
 *
 * This class prevents raw strings from being passed to log methods, ensuring
 * that all logged messages are constructed through approved template functions.
 *
 * Supports context strings that are prepended to log messages as `[context]`.
 * Multiple contexts from parent loggers are chained together (e.g., `[Parent][Child]`).
 *
 * @public
 */
export class SafeLogger<LogObj = unknown> extends Logger<LogObj> {
  /**
   * Array of context strings inherited from parent loggers and this logger.
   * @internal
   */
  protected readonly contexts: string[];

  constructor(settings?: ISafeLoggerSettings<LogObj>, parentContexts: string[] = []) {
    super(settings);
    const newContexts: string[] = [...parentContexts];
    if (settings?.context) {
      newContexts.push(settings.context);
    }
    this.contexts = newContexts;
  }

  /**
   * Formats the context prefix for log messages.
   * Returns empty string if no contexts are set.
   */
  private formatContextPrefix(): string {
    if (this.contexts.length === 0) {
      return '';
    }
    return `${this.contexts.map((ctx) => `[${ctx}]`).join('')} `;
  }

  /**
   * Prepends context to a message if contexts are set.
   */
  private prependContext(message: SafeLogMessage): string {
    const prefix = this.formatContextPrefix();
    return prefix + (message as string);
  }

  /** @inheritdoc */
  override trace(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.trace(this.prependContext(message), ...args);
  }

  /** @inheritdoc */
  override debug(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.debug(this.prependContext(message), ...args);
  }

  /** @inheritdoc */
  override info(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.info(this.prependContext(message), ...args);
  }

  /** @inheritdoc */
  override warn(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.warn(this.prependContext(message), ...args);
  }

  /** @inheritdoc */
  override error(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.error(this.prependContext(message), ...args);
  }

  /** @inheritdoc */
  override fatal(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    return super.fatal(this.prependContext(message), ...args);
  }

  /** @inheritdoc */
  override getSubLogger(settings?: ISafeLoggerSettings<LogObj>): SafeLogger<LogObj> {
    const parentNames = [...(this.settings.parentNames ?? [])];
    if (this.settings.name) {
      parentNames.push(this.settings.name);
    }

    return new SafeLogger(
      {
        ...this.settings,
        ...settings,
        parentNames,
      },
      this.contexts
    );
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
