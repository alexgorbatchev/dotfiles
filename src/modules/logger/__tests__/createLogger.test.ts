/**
 * @file src/modules/logger/__tests__/createLogger.test.ts
 * @description Tests for the createLogger utility.
 *
 * ## Development Plan
 *
 * ### Mandatory Pre-read:
 * - `.clinerules` (for testing requirements)
 * - `memory-bank/techContext.md`
 *
 * ### Tasks:
 * - [x] Import `describe`, `it`, `expect` from `bun:test`.
 * - [x] Import `createLogger` from `../createLogger`.
 * - [x] Import `debug`.
 * - [x] Test if `createLogger` returns a debug instance.
 * - [x] Test if the namespace is correctly formed.
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Ensure 100% test coverage.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { describe, it, expect } from 'bun:test';
// import debug from 'debug'; // Not directly used in tests, createLogger itself uses it.
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
