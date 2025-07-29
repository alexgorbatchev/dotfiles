import { Logger as TSLogger, type Logger as TSLoggerType } from 'tslog';

export type TsLogger = TSLoggerType<any>;

export function createTsLogger(name: string): TsLogger {
  return new TSLogger({ name });
}
