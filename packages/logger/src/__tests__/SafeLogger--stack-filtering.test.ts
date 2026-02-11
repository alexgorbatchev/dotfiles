import { describe, expect, it } from 'bun:test';
import assert from 'node:assert';
import type { ILogObj, ILogObjMeta } from 'tslog';
import { LogLevel } from '../LogLevel';
import { TestLogger } from '../TestLogger';
import type { SafeLogMessage } from '../types';

interface ITslogErrorObject {
  nativeError: Error;
  name: string;
  message: string;
  stack: Array<{
    fullFilePath?: string;
    fileName?: string;
    method?: string;
  }>;
}

function isTslogErrorObject(value: unknown): value is ITslogErrorObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    'nativeError' in value &&
    'stack' in value &&
    Array.isArray((value as ITslogErrorObject).stack)
  );
}

function getLoggedError(log: ILogObjMeta): unknown {
  return log[1];
}

describe('SafeLogger - stack trace filtering', () => {
  it('filters internal stack frames from error logs at INFO level', () => {
    const logger = new TestLogger<ILogObj>({ name: 'test', minLevel: LogLevel.DEFAULT });

    const error = new Error('Test error');
    error.stack = `Error: Test error
    at internalFunction (/path/to/internal/file.ts:10:5)
    at frameworkCode (/node_modules/some-lib/index.js:50:10)
    at hook (/path/to/my.tool.ts:14:13)
    at moreInternalCode (/path/to/internal/other.ts:20:10)`;

    logger.error('Operation failed' as SafeLogMessage, error);

    // Verify the log was emitted
    logger.expect(['ERROR'], ['test'], [], ['Operation failed']);

    // Access the raw log to verify error transformation
    const loggedError = getLoggedError(logger.logs[0]!);

    // tslog transforms errors into objects with parsed stack frames
    assert(isTslogErrorObject(loggedError));
    // The filtered error should ONLY contain the .tool.ts frame
    const stackFrames = loggedError.stack;
    expect(stackFrames).toHaveLength(1);
    expect(stackFrames[0]?.fileName).toBe('my.tool.ts');
    expect(stackFrames[0]?.method).toBe('hook');

    // Verify internal frames are NOT present
    const hasInternalFrames = stackFrames.some(
      (frame) =>
        frame.method === 'internalFunction' ||
        frame.method === 'frameworkCode' ||
        frame.method === 'moreInternalCode' ||
        frame.fullFilePath?.includes('node_modules'),
    );
    expect(hasInternalFrames).toBe(false);
  });

  it('filters internal stack frames from warn logs', () => {
    const logger = new TestLogger<ILogObj>({ name: 'test', minLevel: LogLevel.DEFAULT });

    const error = new Error('Warning condition');
    error.stack = `Error: Warning condition
    at someInternal (/internal/path.ts:5:1)
    at userHook (/tools/example.tool.ts:25:8)`;

    logger.warn('Warning occurred' as SafeLogMessage, error);

    // Verify the log was emitted
    logger.expect(['WARN'], ['test'], [], ['Warning occurred']);

    // Access the raw log to verify error transformation
    const loggedError = getLoggedError(logger.logs[0]!);

    assert(isTslogErrorObject(loggedError));
    // Should only have the .tool.ts frame
    expect(loggedError.stack).toHaveLength(1);
    expect(loggedError.stack[0]?.fileName).toBe('example.tool.ts');

    // Internal frame should be filtered out
    const hasInternal = loggedError.stack.some((frame) => frame.method === 'someInternal');
    expect(hasInternal).toBe(false);
  });

  it('filters stack traces even when tracing is enabled', () => {
    const logger = new TestLogger<ILogObj>({ name: 'test', trace: true });

    const error = new Error('Debug error');
    error.stack = `Error: Debug error
    at internalFunction (/path/to/internal/file.ts:10:5)
    at hook (/path/to/my.tool.ts:14:13)`;

    logger.error('Debug operation failed' as SafeLogMessage, error);

    // Verify the log was emitted
    logger.expect(['ERROR'], ['test'], [], ['Debug operation failed']);

    // Access the raw log to verify error transformation
    const loggedError = getLoggedError(logger.logs[0]!);

    assert(isTslogErrorObject(loggedError));
    // Stack filtering is always on - only .tool.ts frames shown
    expect(loggedError.stack).toHaveLength(1);
    expect(loggedError.stack[0]?.fileName).toBe('my.tool.ts');

    const hasInternalFrame = loggedError.stack.some((frame) => frame.method === 'internalFunction');
    expect(hasInternalFrame).toBe(false);
  });

  it('removes all stack frames when no .tool.ts frames exist', () => {
    const logger = new TestLogger<ILogObj>({ name: 'test', minLevel: LogLevel.DEFAULT });

    const error = new Error('Internal error');
    error.stack = `Error: Internal error
    at internalFunction (/path/to/internal/file.ts:10:5)
    at frameworkCode (/node_modules/some-lib/index.js:50:10)`;

    logger.error('Operation failed' as SafeLogMessage, error);

    // Verify the log was emitted
    logger.expect(['ERROR'], ['test'], [], ['Operation failed']);

    // Access the raw log to verify error transformation
    const loggedError = getLoggedError(logger.logs[0]!);

    assert(isTslogErrorObject(loggedError));
    // When no .tool.ts frames, stack should be empty
    expect(loggedError.stack).toHaveLength(0);
  });

  it('does not filter non-error arguments', () => {
    const logger = new TestLogger<ILogObj>({ name: 'test', minLevel: LogLevel.DEFAULT });

    const context = { toolName: 'my-tool', path: '/some/path' };
    logger.error('Operation failed' as SafeLogMessage, context);

    // Verify the log was emitted
    logger.expect(['ERROR'], ['test'], [], ['Operation failed']);

    // Access the raw log to verify error transformation
    const loggedContext = getLoggedError(logger.logs[0]!) as unknown;

    // Non-error objects should pass through unchanged
    expect(loggedContext).toEqual(context);
  });
});
