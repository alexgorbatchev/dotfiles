import { expect as bunExpect } from 'bun:test';
import * as util from 'node:util';
import type { ILogObj, ILogObjMeta } from 'tslog';
import { type ISafeLoggerSettings, SafeLogger } from './SafeLogger';

/**
 * Defines the log levels available for filtering in `TestLogger`.
 * The `'*'` level can be used to match all log levels.
 */
export type TestLogLevel = '*' | 'SILLY' | 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

/**
 * An extended logger for testing purposes that captures log messages in memory.
 *
 * `TestLogger` allows you to make assertions about logs that were emitted
 * during a test, providing methods to filter and match log messages against
 * expected values.
 *
 * Supports context strings that are prepended to log messages as `[context]`.
 * Multiple contexts from parent loggers are chained together (e.g., `[Parent][Child]`).
 *
 * @example
 * ```typescript
 * import { TestLogger } from '@dotfiles/logger';
 *
 * const logger = new TestLogger();
 * logger.info('Hello, world!');
 *
 * logger.expect(['INFO'], [], [], ['Hello, world!']);
 * ```
 *
 * @see {@link https://tslog.js.org}
 */
export class TestLogger<LogObj = ILogObj> extends SafeLogger<LogObj> {
  /**
   * An array containing all log objects captured by this logger instance.
   */
  public readonly logs: ILogObjMeta[] = [];

  /**
   * Constructs a new `TestLogger` instance.
   * @param settings - Optional `tslog` settings to configure the logger.
   * @param logs - An optional array to use for storing logs.
   *
   * @internal
   */
  constructor(settings?: ISafeLoggerSettings<LogObj>, logs: ILogObjMeta[] = []) {
    super({
      ...settings,
      hideLogPositionForProduction: false,
      attachedTransports: [(obj) => logs.push(obj)],
      overwrite: {
        transportFormatted: (_logMetaMarkup, _logArgs, _logErrors, _settings) => {},
      },
    });
    this.logs = logs;
  }

  /**
   * Creates a sub-logger that inherits the settings of its parent.
   *
   * All logs from the sub-logger are captured in the same log array as the
   * parent logger, allowing for centralized log inspection.
   *
   * @param settings - Optional `tslog` settings to override the parent's settings.
   * @returns A new `TestLogger` instance.
   */
  override getSubLogger(settings?: ISafeLoggerSettings<LogObj>): TestLogger<LogObj> {
    const parentNames = [...(this.settings.parentNames ?? [])];
    // Only add parent name to hierarchy when creating a named sublogger
    // Context-only subloggers don't create a new hierarchy level
    if (this.settings.name && settings?.name) {
      parentNames.push(this.settings.name);
    }

    const subLogger = new TestLogger<LogObj>(
      {
        ...this.settings,
        ...settings,
        parentNames,
      },
      this.logs
    );
    return subLogger;
  }

  private getLogs(
    levels: TestLogLevel[],
    path: string[],
    context: string[],
    matcher?: string | RegExp
  ): ILogObjMeta[] {
    return this.logs.filter((log) => {
      const meta = log['_meta'];
      if (!meta) {
        return false;
      }

      if (!this.isLevelMatch(levels, meta)) {
        return false;
      }

      if (!this.isPathMatch(path, meta)) {
        return false;
      }

      if (!this.isContextMatch(context, log)) {
        return false;
      }

      return this.isMatcherMatch(log, matcher);
    });
  }

  private isLevelMatch(levels: TestLogLevel[], meta: ILogObjMeta['_meta']): boolean {
    return levels.includes('*') || levels.includes(meta.logLevelName as TestLogLevel);
  }

  private isPathMatch(path: string[], meta: ILogObjMeta['_meta']): boolean {
    const logPath = [...(meta.parentNames ?? []), meta.name].filter((p) => typeof p === 'string' && p.length > 0);

    if (logPath.length !== path.length) {
      return false;
    }

    return path.every((part, i) => part === logPath[i]);
  }

  private isContextMatch(context: string[], log: ILogObjMeta): boolean {
    if (context.length === 0) {
      return true;
    }

    const logMessage = formatLogMessage(log);
    if (!logMessage) {
      return false;
    }

    // Context appears as [context] prefix in the log message
    // Multiple contexts are chained: [ctx1][ctx2]
    const expectedPrefix = context.map((c) => `[${c}]`).join('');
    return logMessage.startsWith(expectedPrefix);
  }

  private isMatcherMatch(log: ILogObjMeta, matcher?: string | RegExp): boolean {
    if (matcher === undefined) {
      return true;
    }

    const firstArg = log[0] as unknown;
    if (typeof firstArg !== 'string') {
      return false;
    }

    if (typeof matcher === 'string') {
      return firstArg.includes(matcher);
    }

    if (matcher instanceof RegExp) {
      return matcher.test(firstArg);
    }

    return false;
  }

  /**
   * Prints captured logs to the console, filtered by level, path, and an optional matcher.
   *
   * This method is useful for debugging tests by inspecting the logs that were
   * captured during a test run.
   *
   * @param levels - An array of log levels to match.
   * @param path - An array of logger names representing the path to the logger.
   * @param context - An array of context strings to match against (appears as [context] prefix).
   * @param matcher - An optional string or regex to match against the log message.
   */
  printLogs(levels: TestLogLevel[], path: string[], context: string[], matcher?: string | RegExp): void {
    const logs = this.getLogs(levels, path, context, matcher);
    for (const log of logs) {
      const { _meta, ...rest } = log;
      // biome-ignore lint/suspicious/noConsole: needed for debugging
      console.log(JSON.stringify(rest));
    }
  }

  /**
   * Asserts that the captured logs match a set of expected matchers.
   *
   * This method filters logs by level and path, then compares the resulting
   * log messages against the provided matchers. The test will fail if the
   * number of logs does not match the number of matchers, or if any log
   * message does not match its corresponding matcher.
   *
   * @param levels - An array of log levels to match.
   * @param path - An array of logger names representing the path to the logger.
   * @param context - An array of context strings to match against (appears as [context] prefix).
   * @param matchers - An array of strings or regular expressions to match against the log messages.
   */
  expect(levels: TestLogLevel[], path: string[], context: string[], matchers: (string | RegExp)[]): void {
    const logs = this.getLogs(levels, path, context);

    if (logs.length < matchers.length) {
      this.failExpectation(logs, matchers);
    }

    this.validateMatchers(logs, matchers);
  }

  private failExpectation(logs: ILogObjMeta[], matchers: (string | RegExp)[]): never {
    const results: string[] = ['Expected logs:'];
    for (const matcher of matchers) {
      results.push(`  - ${matcher}`);
    }
    results.push(`Actual logs:`);
    for (const log of logs) {
      results.push(`  - ${formatLogMessage(log)}`);
    }

    bunExpect().fail(results.join('\n'));
    throw new Error('Test failed'); // This line will never be reached but satisfies TypeScript
  }

  private validateMatchers(logs: ILogObjMeta[], matchers: (string | RegExp)[]): void {
    for (let i = 0; i < matchers.length; i++) {
      const log = logs[i];
      const matcher = matchers[i];

      if (!log) {
        this.failExpectation(logs, matchers);
        return; // This will never be reached but satisfies TypeScript
      }

      const logMessage = formatLogMessage(log);
      if (!logMessage) {
        this.failExpectation(logs, matchers);
        return; // This will never be reached but satisfies TypeScript
      }

      if (matcher && !this.isMessageMatch(logMessage, matcher)) {
        this.failExpectation(logs, matchers);
        return; // This will never be reached but satisfies TypeScript
      }
    }
  }

  private isMessageMatch(logMessage: string, matcher: string | RegExp): boolean {
    if (typeof matcher === 'string') {
      return logMessage.includes(matcher);
    }
    if (matcher instanceof RegExp) {
      return matcher.test(logMessage);
    }
    return false;
  }
}

function formatLogMessage(log: ILogObjMeta): string | undefined {
  const [message, ...args] = getIndexedProperties(log);
  return util.format(message, ...args);
}

function getIndexedProperties(obj: ILogObjMeta): unknown[] {
  const properties: unknown[] = [];
  let index = 0;

  while (true) {
    const property = obj[index];
    if (typeof property === 'undefined') {
      break;
    }
    properties.push(property);
    index++;
  }

  return properties;
}
