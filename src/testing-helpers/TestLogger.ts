import { expect as bunExpect } from 'bun:test';
import { Logger, type ILogObjMeta, type ISettingsParam } from 'tslog';
import * as util from 'util';

export type LogLevel = '*' | 'SILLY' | 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export class TestLogger<LogObj = any> extends Logger<LogObj> {
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

  getLogs(levels: LogLevel[], path: string[], matcher?: string | RegExp): ILogObjMeta[] {
    return this.logs.filter((log) => {
      const meta = log['_meta'];
      if (!meta) {
        return false;
      }

      const levelMatch = levels.includes('*') || levels.includes(meta.logLevelName as LogLevel);
      if (!levelMatch) {
        return false;
      }

      const logPath = [...(meta.parentNames ?? []), meta.name].filter(
        (p) => typeof p === 'string' && p.length > 0
      );

      if (logPath.length !== path.length) {
        return false;
      }

      if (!path.every((part, i) => part === logPath[i])) {
        return false;
      }

      if (matcher === undefined) {
        return true;
      }

      const firstArg = log[0] as any;
      if (typeof firstArg === 'string' && typeof matcher === 'string') {
        return firstArg.includes(matcher);
      }

      if (typeof firstArg === 'string' && matcher instanceof RegExp) {
        return matcher.test(firstArg);
      }

      return false;
    });
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

    const fail = () => {
      const results: string[] = ['Expected logs:'];
      for (const matcher of matchers) {
        results.push(`  - ${matcher}`);
      }
      results.push(`Actual logs:`);
      for (const log of logs) {
        results.push(`  - ${formatLogMessage(log)}`);
      }

      bunExpect().fail(results.join('\n'));
    };

    if (logs.length < matchers.length) {
      fail();
    }

    for (let i = 0; i < matchers.length; i++) {
      const log = logs[i];

      if (typeof log === 'undefined') {
        fail();
      } else {
        const logMessage = formatLogMessage(log);
        const matcher = matchers[i];

        if (typeof logMessage === 'undefined') {
          fail();
        } else if (typeof matcher === 'string') {
          if (!logMessage.includes(matcher)) fail();
        } else if (matcher instanceof RegExp) {
          if (!matcher.test(logMessage)) fail();
        }
      }
    }
  }
}

function formatLogMessage(log: ILogObjMeta): string | undefined {
  const [message, ...args] = getIndexedProperties(log);
  return util.format(message, ...args);
}

function getIndexedProperties(obj: any): any[] {
  const properties: any[] = [];
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