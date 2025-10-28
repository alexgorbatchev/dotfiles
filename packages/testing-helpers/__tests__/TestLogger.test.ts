import { describe, expect, it, spyOn } from 'bun:test';
import { TestLogger, type TestLogLevel } from '@dotfiles/logger';
import type { ILogObjMeta } from 'tslog';

interface TestLoggerWithPrivates {
  getLogs(levels: TestLogLevel[], path: string[], matcher?: string | RegExp): ILogObjMeta[];
}

describe('TestLogger', () => {
  describe('getLogs', () => {
    it('should filter logs by level', () => {
      const logger = new TestLogger();
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      const infoLogs = (logger as unknown as TestLoggerWithPrivates).getLogs(['INFO'], []);
      expect(infoLogs).toHaveLength(1);
      expect(infoLogs[0]?.[0]).toMatch('info message');

      const warnLogs = (logger as unknown as TestLoggerWithPrivates).getLogs(['WARN'], []);
      expect(warnLogs).toHaveLength(1);
      expect(warnLogs[0]?.[0]).toMatch('warn message');

      const errorLogs = (logger as unknown as TestLoggerWithPrivates).getLogs(['ERROR'], []);
      expect(errorLogs).toHaveLength(1);
      expect(errorLogs[0]?.[0]).toMatch('error message');
    });

    it('should filter logs by path', () => {
      const logger = new TestLogger();
      const subLogger = logger.getSubLogger({ name: 'Sub' });
      const subSubLogger = subLogger.getSubLogger({ name: 'SubSub' });

      logger.info('root message');
      subLogger.info('sub message');
      subSubLogger.info('sub-sub message');

      const rootLogs = (logger as unknown as TestLoggerWithPrivates).getLogs(['INFO'], []);
      expect(rootLogs).toHaveLength(1);
      expect(rootLogs[0]?.[0]).toMatch('root message');

      const subLogs = (logger as unknown as TestLoggerWithPrivates).getLogs(['INFO'], ['Sub']);
      expect(subLogs).toHaveLength(1);
      expect(subLogs[0]?.[0]).toMatch('sub message');

      const subSubLogs = (logger as unknown as TestLoggerWithPrivates).getLogs(['INFO'], ['Sub', 'SubSub']);
      expect(subSubLogs).toHaveLength(1);
      expect(subSubLogs[0]?.[0]).toMatch('sub-sub message');
    });

    it('should filter by level and path', () => {
      const logger = new TestLogger();
      const subLogger = logger.getSubLogger({ name: 'Sub' });

      logger.info('root info');
      logger.warn('root warn');
      subLogger.info('sub info');
      subLogger.warn('sub warn');

      const rootInfoLogs = (logger as unknown as TestLoggerWithPrivates).getLogs(['INFO'], []);
      expect(rootInfoLogs).toHaveLength(1);
      expect(rootInfoLogs[0]?.[0]).toMatch('root info');

      const subWarnLogs = (logger as unknown as TestLoggerWithPrivates).getLogs(['WARN'], ['Sub']);
      expect(subWarnLogs).toHaveLength(1);
      expect(subWarnLogs[0]?.[0]).toMatch('sub warn');
    });

    it('should return all levels with wildcard', () => {
      const logger = new TestLogger();
      logger.info('info message');
      logger.warn('warn message');

      const logs = (logger as unknown as TestLoggerWithPrivates).getLogs(['*'], []);
      expect(logs).toHaveLength(2);
    });

    it('should return empty array when no logs match', () => {
      const logger = new TestLogger();
      logger.info('info message');

      const logs = (logger as unknown as TestLoggerWithPrivates).getLogs(['WARN'], []);
      expect(logs).toHaveLength(0);
    });

    it('should print logs to the console', () => {
      const logger = new TestLogger({ name: 'TestLogger' });
      logger.info('info message');
      logger.warn('warn message');

      const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});

      logger.printLogs(['INFO'], ['TestLogger']);
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(JSON.stringify({ '0': 'info message' })));

      consoleSpy.mockClear();

      logger.printLogs(['*'], ['TestLogger']);
      expect(consoleSpy).toHaveBeenCalledTimes(2);

      consoleSpy.mockRestore();
    });

    describe('with matcher', () => {
      it('should filter logs by a string matcher', () => {
        const logger = new TestLogger();
        logger.info('info message 1');
        logger.info('info message 2');

        const logs = (logger as unknown as TestLoggerWithPrivates).getLogs(['INFO'], [], 'message 1');
        expect(logs).toHaveLength(1);
        expect(logs[0]?.[0]).toMatch('info message 1');
      });

      it('should filter logs by a regex matcher', () => {
        const logger = new TestLogger();
        logger.info('info message 1');
        logger.info('info message 2');

        const logs = (logger as unknown as TestLoggerWithPrivates).getLogs(['INFO'], [], /message 2/);
        expect(logs).toHaveLength(1);
        expect(logs[0]?.[0]).toMatch('info message 2');
      });

      it('should return no logs if matcher does not match', () => {
        const logger = new TestLogger();
        logger.info('info message 1');

        const logs = (logger as unknown as TestLoggerWithPrivates).getLogs(['INFO'], [], 'no match');
        expect(logs).toHaveLength(0);
      });

      it('should not match if the log argument is not a string', () => {
        const logger = new TestLogger();
        logger.info({ message: 'info message 1' });

        const logs = (logger as unknown as TestLoggerWithPrivates).getLogs(['INFO'], [], 'info message 1');
        expect(logs).toHaveLength(0);
      });

      it('should print filtered logs to the console', () => {
        const logger = new TestLogger({ name: 'TestLogger' });
        logger.info('info message 1');
        logger.info('info message 2');

        const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});

        logger.printLogs(['INFO'], ['TestLogger'], 'message 1');
        expect(consoleSpy).toHaveBeenCalledTimes(1);
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(JSON.stringify({ '0': 'info message 1' })));

        consoleSpy.mockRestore();
      });
    });
  });

  describe('expect', () => {
    it('should match each log with the corresponding matcher', () => {
      const logger = new TestLogger();
      logger.info('info message 1');
      logger.info('info message 2');

      logger.expect(['INFO'], [], ['info message 1', 'info message 2']);
    });

    it.failing('should fail if the number of logs does not match the number of matchers', () => {
      const logger = new TestLogger();
      logger.info('info message 1');

      logger.expect(['INFO'], [], ['message 1', 'message 2']);
    });

    it.failing('should fail if a log does not match the corresponding matcher', () => {
      const logger = new TestLogger();
      logger.info('info message 1');
      logger.info('info message 2');

      logger.expect(['INFO'], [], ['info message 1', 'unmatched']);
    });
  });
});
