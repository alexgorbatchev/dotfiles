import { describe, expect, test } from 'bun:test';
import { createSafeLogMessage } from '../createSafeLogMessage';
import { TestLogger } from '../TestLogger';

describe('SafeLogger context', () => {
  test('should prepend context to log messages when context is set', () => {
    const logger = new TestLogger({ name: 'test', minLevel: 0 });
    const contextLogger = logger.getSubLogger({ name: 'child', context: 'MyContext' });

    contextLogger.info(createSafeLogMessage('test message'));

    const logMessage = String(logger.logs[0]?.[0]);
    expect(logMessage).toBe('[MyContext] test message');
  });

  test('should chain multiple contexts from parent to child', () => {
    const logger = new TestLogger({ name: 'test', minLevel: 0 });
    const parentContext = logger.getSubLogger({ name: 'parent', context: 'Parent' });
    const childContext = parentContext.getSubLogger({ name: 'child', context: 'Child' });

    childContext.info(createSafeLogMessage('test message'));

    const logMessage = String(logger.logs[0]?.[0]);
    expect(logMessage).toBe('[Parent][Child] test message');
  });

  test('should not modify message when no context is set', () => {
    const logger = new TestLogger({ name: 'test', minLevel: 0 });
    const subLogger = logger.getSubLogger({ name: 'child' });

    subLogger.info(createSafeLogMessage('test message'));

    const logMessage = String(logger.logs[0]?.[0]);
    expect(logMessage).toBe('test message');
  });

  test('should inherit parent context when child has no context', () => {
    const logger = new TestLogger({ name: 'test', minLevel: 0 });
    const parentContext = logger.getSubLogger({ name: 'parent', context: 'Parent' });
    const childNoContext = parentContext.getSubLogger({ name: 'child' });

    childNoContext.info(createSafeLogMessage('test message'));

    const logMessage = String(logger.logs[0]?.[0]);
    expect(logMessage).toBe('[Parent] test message');
  });

  test('should work with all log levels', () => {
    const logger = new TestLogger({ name: 'test', minLevel: 0 });
    const contextLogger = logger.getSubLogger({ name: 'child', context: 'Ctx' });

    contextLogger.trace(createSafeLogMessage('trace msg'));
    contextLogger.debug(createSafeLogMessage('debug msg'));
    contextLogger.info(createSafeLogMessage('info msg'));
    contextLogger.warn(createSafeLogMessage('warn msg'));
    contextLogger.error(createSafeLogMessage('error msg'));
    contextLogger.fatal(createSafeLogMessage('fatal msg'));

    expect(String(logger.logs[0]?.[0])).toBe('[Ctx] trace msg');
    expect(String(logger.logs[1]?.[0])).toBe('[Ctx] debug msg');
    expect(String(logger.logs[2]?.[0])).toBe('[Ctx] info msg');
    expect(String(logger.logs[3]?.[0])).toBe('[Ctx] warn msg');
    expect(String(logger.logs[4]?.[0])).toBe('[Ctx] error msg');
    expect(String(logger.logs[5]?.[0])).toBe('[Ctx] fatal msg');
  });
});
