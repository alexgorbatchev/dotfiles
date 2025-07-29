import { Logger, type ILogObjMeta, type ISettingsParam } from 'tslog';

export type LogLevel = '*' | 'SILLY' | 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export class TestLogger<LogObj> extends Logger<LogObj> {
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

  getLogs(levels: LogLevel[], path: string[]): ILogObjMeta[] {
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

      return path.every((part, i) => part === logPath[i]);
    });
  }

  printLogs(levels: LogLevel[], path: string[]): void {
    const logs = this.getLogs(levels, path);
    for (const log of logs) {
      const { _meta, ...rest } = log;
      console.log(JSON.stringify(rest));
    }
  }
}
