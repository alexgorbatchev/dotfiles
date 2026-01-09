import { describe, expect, it } from 'bun:test';
import type { ILogObj } from 'tslog';
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

    const errorLogs = logger.logs.filter((log) => log['_meta']?.logLevelName === 'ERROR');
    expect(errorLogs).toHaveLength(1);

    const loggedError = errorLogs[0]?.[1];

    // tslog transforms errors into objects with parsed stack frames
    if (isTslogErrorObject(loggedError)) {
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
          frame.fullFilePath?.includes('node_modules')
      );
      expect(hasInternalFrames).toBe(false);
    } else {
      // Fallback for direct Error object (shouldn't happen with tslog)
      expect(loggedError).toBeInstanceOf(Error);
    }
  });

  it('filters internal stack frames from warn logs', () => {
    const logger = new TestLogger<ILogObj>({ name: 'test', minLevel: LogLevel.DEFAULT });

    const error = new Error('Warning condition');
    error.stack = `Error: Warning condition
    at someInternal (/internal/path.ts:5:1)
    at userHook (/tools/example.tool.ts:25:8)`;

    logger.warn('Warning occurred' as SafeLogMessage, error);

    const warnLogs = logger.logs.filter((log) => log['_meta']?.logLevelName === 'WARN');
    const loggedError = warnLogs[0]?.[1];

    if (isTslogErrorObject(loggedError)) {
      // Should only have the .tool.ts frame
      expect(loggedError.stack).toHaveLength(1);
      expect(loggedError.stack[0]?.fileName).toBe('example.tool.ts');

      // Internal frame should be filtered out
      const hasInternal = loggedError.stack.some((frame) => frame.method === 'someInternal');
      expect(hasInternal).toBe(false);
    }
  });

  it('preserves full stack trace when tracing is enabled', () => {
    const logger = new TestLogger<ILogObj>({ name: 'test', trace: true });

    const error = new Error('Debug error');
    error.stack = `Error: Debug error
    at internalFunction (/path/to/internal/file.ts:10:5)
    at hook (/path/to/my.tool.ts:14:13)`;

    logger.error('Debug operation failed' as SafeLogMessage, error);

    const errorLogs = logger.logs.filter((log) => log['_meta']?.logLevelName === 'ERROR');
    const loggedError = errorLogs[0]?.[1];

    if (isTslogErrorObject(loggedError)) {
      // At TRACE level, both frames should be preserved
      expect(loggedError.stack.length).toBeGreaterThanOrEqual(2);

      const hasInternalFrame = loggedError.stack.some((frame) => frame.method === 'internalFunction');
      const hasToolFrame = loggedError.stack.some((frame) => frame.fileName === 'my.tool.ts');

      expect(hasInternalFrame).toBe(true);
      expect(hasToolFrame).toBe(true);
    }
  });

  it('removes all stack frames when no .tool.ts frames exist', () => {
    const logger = new TestLogger<ILogObj>({ name: 'test', minLevel: LogLevel.DEFAULT });

    const error = new Error('Internal error');
    error.stack = `Error: Internal error
    at internalFunction (/path/to/internal/file.ts:10:5)
    at frameworkCode (/node_modules/some-lib/index.js:50:10)`;

    logger.error('Operation failed' as SafeLogMessage, error);

    const errorLogs = logger.logs.filter((log) => log['_meta']?.logLevelName === 'ERROR');
    const loggedError = errorLogs[0]?.[1];

    if (isTslogErrorObject(loggedError)) {
      // When no .tool.ts frames, stack should be empty
      expect(loggedError.stack).toHaveLength(0);
    }
  });

  it('does not filter non-error arguments', () => {
    const logger = new TestLogger<ILogObj>({ name: 'test', minLevel: LogLevel.DEFAULT });

    const context = { toolName: 'my-tool', path: '/some/path' };
    logger.error('Operation failed' as SafeLogMessage, context);

    const errorLogs = logger.logs.filter((log) => log['_meta']?.logLevelName === 'ERROR');
    const loggedContext = errorLogs[0]?.[1] as unknown;

    // Non-error objects should pass through unchanged
    expect(loggedContext).toEqual(context);
  });
});
