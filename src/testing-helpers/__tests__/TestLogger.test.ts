import { describe, it, expect, spyOn } from 'bun:test';
import { TestLogger } from '../TestLogger';

describe('TestLogger', () => {
  describe('getLogs', () => {
    it('should filter logs by level', () => {
      const logger = new TestLogger();
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      const infoLogs = logger.getLogs(['INFO'], []);
      expect(infoLogs).toHaveLength(1);
      expect(infoLogs[0]?.[0]).toMatch('info message');

      const warnLogs = logger.getLogs(['WARN'], []);
      expect(warnLogs).toHaveLength(1);
      expect(warnLogs[0]?.[0]).toMatch('warn message');

      const errorLogs = logger.getLogs(['ERROR'], []);
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

      const rootLogs = logger.getLogs(['INFO'], []);
      expect(rootLogs).toHaveLength(1);
      expect(rootLogs[0]?.[0]).toMatch('root message');

      const subLogs = logger.getLogs(['INFO'], ['Sub']);
      expect(subLogs).toHaveLength(1);
      expect(subLogs[0]?.[0]).toMatch('sub message');

      const subSubLogs = logger.getLogs(['INFO'], ['Sub', 'SubSub']);
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

      const rootInfoLogs = logger.getLogs(['INFO'], []);
      expect(rootInfoLogs).toHaveLength(1);
      expect(rootInfoLogs[0]?.[0]).toMatch('root info');

      const subWarnLogs = logger.getLogs(['WARN'], ['Sub']);
      expect(subWarnLogs).toHaveLength(1);
      expect(subWarnLogs[0]?.[0]).toMatch('sub warn');
    });

    it('should return all levels with wildcard', () => {
      const logger = new TestLogger();
      logger.info('info message');
      logger.warn('warn message');

      const logs = logger.getLogs(['*'], []);
      expect(logs).toHaveLength(2);
    });

    it('should return empty array when no logs match', () => {
      const logger = new TestLogger();
      logger.info('info message');

      const logs = logger.getLogs(['WARN'], []);
      expect(logs).toHaveLength(0);
    });

    it('should print logs to the console', () => {
      const logger = new TestLogger({name: 'TestLogger'});
      logger.info('info message');
      logger.warn('warn message');

      const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});

      logger.printLogs(['INFO'], ['TestLogger']);
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(JSON.stringify ({ '0': 'info message' } )));

      consoleSpy.mockClear();

      logger.printLogs(['*'], ['TestLogger']);
      expect(consoleSpy).toHaveBeenCalledTimes(2);

      consoleSpy.mockRestore();
    });
  });
});