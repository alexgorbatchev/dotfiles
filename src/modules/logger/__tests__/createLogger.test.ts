import { describe, it, expect } from 'bun:test';
import { createLogger } from '../createLogger';

describe('createLogger', () => {
  it('should return a debug instance', () => {
    const logger = createLogger('testLogger');
    expect(logger).toBeInstanceOf(Function); // debug instances are functions
    // Check for a property that debug instances have, e.g., `namespace`
    expect(logger.namespace).toBeDefined();
  });

  it('should create a logger with the correct namespace', () => {
    const loggerName = 'myTestComponent';
    const logger = createLogger(loggerName);
    // Assuming PROJECT_NAMESPACE in createLogger.ts is 'dot'
    expect(logger.namespace).toBe(`dot:${loggerName}`);
  });

  it('should create different loggers for different names', () => {
    const logger1 = createLogger('loggerOne');
    const logger2 = createLogger('loggerTwo');
    expect(logger1.namespace).toBe('dot:loggerOne');
    expect(logger2.namespace).toBe('dot:loggerTwo');
    expect(logger1).not.toBe(logger2);
  });
});
