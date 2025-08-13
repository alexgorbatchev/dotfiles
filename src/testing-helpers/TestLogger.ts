import { expect as bunExpect } from 'bun:test';
import * as util from 'node:util';
import { formatZodErrors } from '@modules/logger';
import { type ILogObj, type ILogObjMeta, type ISettingsParam, Logger } from 'tslog';
import type { ZodError } from 'zod';

export type LogLevel = '*' | 'SILLY' | 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export class TestLogger<LogObj = ILogObj> extends Logger<LogObj> {
  public readonly logs: ILogObjMeta[] = [];

  constructor(settings?: ISettingsParam<LogObj>, logs: ILogObjMeta[] = []) {
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

  override getSubLogger(settings?: ISettingsParam<LogObj>): TestLogger<LogObj> {
    const parentNames = [...(this.settings.parentNames ?? [])];
    if (this.settings.name) {
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

  /**
   * Logs Zod validation errors in a readable format using error level logging.
   * @param error The Zod error object
   */
  zodErrors(error: ZodError): void {
    const messages = formatZodErrors(error);
    for (const message of messages) {
      this.error(message as string & LogObj);
    }
  }

  private getLogs(levels: LogLevel[], path: string[], matcher?: string | RegExp): ILogObjMeta[] {
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

      return this.isMatcherMatch(log, matcher);
    });
  }

  private isLevelMatch(levels: LogLevel[], meta: ILogObjMeta['_meta']): boolean {
    return levels.includes('*') || levels.includes(meta.logLevelName as LogLevel);
  }

  private isPathMatch(path: string[], meta: ILogObjMeta['_meta']): boolean {
    const logPath = [...(meta.parentNames ?? []), meta.name].filter((p) => typeof p === 'string' && p.length > 0);

    if (logPath.length !== path.length) {
      return false;
    }

    return path.every((part, i) => part === logPath[i]);
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

  printLogs(levels: LogLevel[], path: string[], matcher?: string | RegExp): void {
    const logs = this.getLogs(levels, path, matcher);
    for (const log of logs) {
      const { _meta, ...rest } = log;
      console.log(JSON.stringify(rest));
    }
  }

  expect(levels: LogLevel[], path: string[], matchers: (string | RegExp)[]): void {
    const logs = this.getLogs(levels, path);

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
