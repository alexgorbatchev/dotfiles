import { type ILogObjMeta, type ISettingsParam, Logger } from 'tslog';
import type { ZodError } from 'zod';
import { filterErrorStackToToolFiles, isError } from './filterErrorStack';
import { formatZodErrors } from './formatZodErrors';
import type { SafeLogMessage } from './types';

/**
 * Extended settings for SafeLogger that adds context support.
 */
export interface ISafeLoggerSettings<LogObj> extends ISettingsParam<LogObj> {
  /**
   * A context string to prepend to log messages as `[context]`.
   * Multiple contexts from parent loggers are chained together.
   * Uses tslog's built-in `prefix` array internally.
   */
  context?: string;
  /**
   * Whether source location tracing is enabled.
   */
  trace?: boolean;
}

/**
 * Wraps a context string with brackets for display.
 */
function formatContext(context: string): string {
  return `[${context}]`;
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
 * Uses tslog's built-in `prefix` array internally.
 */
export class SafeLogger<LogObj = unknown> extends Logger<LogObj> {
  constructor(settings?: ISafeLoggerSettings<LogObj>) {
    const existingPrefix = settings?.prefix ?? [];
    const prefix: string[] = existingPrefix.map((p) => String(p));
    if (settings?.context) {
      prefix.push(formatContext(settings.context));
    }
    super({ ...settings, prefix });
  }

  /**
   * Checks if this logger has tracing enabled.
   * When enabled, full error stacks and source locations are shown.
   */
  public isTracingEnabled(): boolean {
    const settings = this.settings as ISafeLoggerSettings<LogObj>;
    return settings.trace === true;
  }

  /**
   * Filters error arguments to only show .tool.ts stack frames.
   * Only applies when NOT in trace mode (trace shows full stacks for debugging).
   */
  private filterErrorArgs(args: unknown[]): unknown[] {
    if (this.isTracingEnabled()) {
      return args;
    }

    const filteredArgs: unknown[] = [];
    for (const arg of args) {
      if (isError(arg)) {
        filteredArgs.push(filterErrorStackToToolFiles(arg));
      } else {
        filteredArgs.push(arg);
      }
    }
    return filteredArgs;
  }

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
    const filteredArgs = this.filterErrorArgs(args);
    return super.info(message as string, ...filteredArgs);
  }

  /** @inheritdoc */
  override warn(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    const filteredArgs = this.filterErrorArgs(args);
    return super.warn(message as string, ...filteredArgs);
  }

  /** @inheritdoc */
  override error(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    const filteredArgs = this.filterErrorArgs(args);
    return super.error(message as string, ...filteredArgs);
  }

  /** @inheritdoc */
  override fatal(message: SafeLogMessage, ...args: unknown[]): (LogObj & ILogObjMeta) | undefined {
    const filteredArgs = this.filterErrorArgs(args);
    return super.fatal(message as string, ...filteredArgs);
  }

  /** @inheritdoc */
  override getSubLogger(settings?: ISafeLoggerSettings<LogObj>): SafeLogger<LogObj> {
    const parentNames = [...(this.settings.parentNames ?? [])];
    // Only add parent name to hierarchy when creating a named sublogger
    // Context-only subloggers don't create a new hierarchy level
    if (this.settings.name && settings?.name) {
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

  /**
   * Sets the prefix for this logger instance.
   * The prefix is prepended to all log messages.
   *
   * @param context - A context string to set as the prefix (will be wrapped as `[context]`)
   * @returns This logger instance for chaining
   *
   * @example
   * ```typescript
   * const logger = parentLogger.getSubLogger({ name: 'method' });
   * logger.setPrefix('toolName');
   * logger.info(messages.installing()); // Output: [toolName] Installing...
   * ```
   */
  setPrefix(context: string): this {
    this.settings.prefix = [formatContext(context)];
    return this;
  }
}
