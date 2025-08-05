import { describe, it, beforeEach, expect } from 'bun:test';
import { TestLogger, createMemFileSystem, type MemFileSystemReturn } from '@testing-helpers';
import { HookExecutor, type HookExecutionOptions } from '../HookExecutor';
import type { InstallHookContext } from '@types';
import { TrackedFileSystem } from '@modules/file-registry';
import { mock, spyOn } from 'bun:test';
import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';

// Helper function for tests to create SafeLogMessage
function testLogMessage(message: string): SafeLogMessage {
  return message as SafeLogMessage;
}

describe('HookExecutor', () => {
  let logger: TestLogger;
  let hookExecutor: HookExecutor;
  let memFs: MemFileSystemReturn;
  let mockTrackedFileSystem: TrackedFileSystem;

  beforeEach(async () => {
    logger = new TestLogger();
    hookExecutor = new HookExecutor(logger);
    
    memFs = await createMemFileSystem();

    // Create a proper TrackedFileSystem mock that will pass instanceof check
    mockTrackedFileSystem = Object.create(TrackedFileSystem.prototype);
    mockTrackedFileSystem.withToolName = mock(() => mockTrackedFileSystem);
  });

  describe('executeHook', () => {
    const baseContext: InstallHookContext = {
      toolName: 'test-tool',
      installDir: '/test/install/dir',
      systemInfo: {
        platform: 'darwin',
        arch: 'x64',
        release: '10.0.0',
        homeDir: '/home/user',
      },
    };

    it('should execute hook successfully and return correct result', async () => {
      const mockHook = mock(async (ctx: InstallHookContext) => {
        expect(ctx.toolName).toBe('test-tool');
        // These properties are added by the enhanced context but typed as InstallHookContext
        expect((ctx as any).fileSystem).toBeDefined();
        expect((ctx as any).logger).toBeDefined();
      });

      const enhancedContext = hookExecutor.createEnhancedContext(
        baseContext, memFs.fs, logger
      );

      const result = await hookExecutor.executeHook('testHook', mockHook, enhancedContext);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.skipped).toBe(false);
      expect(mockHook).toHaveBeenCalledTimes(1);
    });

    it('should handle hook errors and return failure result', async () => {
      const errorMessage = 'Hook execution failed';
      const mockHook = mock(async () => {
        throw new Error(errorMessage);
      });

      const enhancedContext = hookExecutor.createEnhancedContext(
        baseContext, memFs.fs, logger
      );

      const result = await hookExecutor.executeHook('testHook', mockHook, enhancedContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.skipped).toBe(false);
    });

    it('should handle hook timeout', async () => {
      const mockHook = mock(async () => {
        // Simulate a slow hook that takes longer than timeout
        await new Promise(resolve => setTimeout(resolve, 200));
      });

      const enhancedContext = hookExecutor.createEnhancedContext(
        baseContext, memFs.fs, logger
      );

      const options: HookExecutionOptions = { timeoutMs: 50 };
      const result = await hookExecutor.executeHook('testHook', mockHook, enhancedContext, options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
      expect(result.skipped).toBe(false);
    });

    it('should continue on error when continueOnError is true', async () => {
      const errorMessage = 'Hook failed but should continue';
      const mockHook = mock(async () => {
        throw new Error(errorMessage);
      });

      const enhancedContext = hookExecutor.createEnhancedContext(
        baseContext, memFs.fs, logger
      );

      const options: HookExecutionOptions = { continueOnError: true };
      const result = await hookExecutor.executeHook('testHook', mockHook, enhancedContext, options);

      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
    });

    it('should use default timeout when not specified', async () => {
      const mockHook = mock(async () => {});

      const enhancedContext = hookExecutor.createEnhancedContext(
        baseContext, memFs.fs, logger
      );

      // Spy on the internal setTimeout to verify default timeout is used
      const setTimeoutSpy = spyOn(global, 'setTimeout');

      await hookExecutor.executeHook('testHook', mockHook, enhancedContext);

      // Check that setTimeout was called with default timeout (60000ms)
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 60000);
      setTimeoutSpy.mockRestore();
    });
  });

  describe('createEnhancedContext', () => {
    const baseContext: InstallHookContext = {
      toolName: 'test-tool',
      installDir: '/test/install/dir',
    };

    it('should create enhanced context with regular filesystem', () => {
      const enhancedContext = hookExecutor.createEnhancedContext(
        baseContext, memFs.fs, logger
      );

      expect(enhancedContext.toolName).toBe(baseContext.toolName);
      expect(enhancedContext.installDir).toBe(baseContext.installDir);
      expect(enhancedContext.fileSystem).toBe(memFs.fs);
      expect(enhancedContext.logger).toBeDefined();
    });

    it('should create enhanced context with TrackedFileSystem and create tool-specific instance', () => {
      const enhancedContext = hookExecutor.createEnhancedContext(
        baseContext, mockTrackedFileSystem, logger
      );

      expect(enhancedContext.fileSystem).toBe(mockTrackedFileSystem);
      expect(mockTrackedFileSystem.withToolName).toHaveBeenCalledWith('test-tool');
    });

    it('should create sublogger with correct name', () => {
      const enhancedContext = hookExecutor.createEnhancedContext(
        baseContext, memFs.fs, logger
      );

      // Verify logger is a sublogger (should have the expected name in logs)
      enhancedContext.logger.info(testLogMessage('Test message'));
      logger.expect(['INFO'], ['Hook-test-tool'], ['Test message']);
    });
  });

  describe('executeHooks', () => {
    const baseContext: InstallHookContext = {
      toolName: 'test-tool',
      installDir: '/test/install/dir',
    };

    it('should execute multiple hooks in sequence', async () => {
      const hook1 = mock(async () => {});
      const hook2 = mock(async () => {});
      const hook3 = mock(async () => {});

      const hooks = [
        { name: 'hook1', hook: hook1 },
        { name: 'hook2', hook: hook2 },
        { name: 'hook3', hook: hook3 },
      ];

      const enhancedContext = hookExecutor.createEnhancedContext(
        baseContext, memFs.fs, logger
      );

      const results = await hookExecutor.executeHooks(hooks, enhancedContext);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
      expect(hook1).toHaveBeenCalledTimes(1);
      expect(hook2).toHaveBeenCalledTimes(1);
      expect(hook3).toHaveBeenCalledTimes(1);
    });

    it('should stop execution on hook failure when continueOnError is false', async () => {
      const hook1 = mock(async () => {});
      const hook2 = mock(async () => { throw new Error('Hook2 failed'); });
      const hook3 = mock(async () => {});

      const hooks = [
        { name: 'hook1', hook: hook1 },
        { name: 'hook2', hook: hook2, options: { continueOnError: false } },
        { name: 'hook3', hook: hook3 },
      ];

      const enhancedContext = hookExecutor.createEnhancedContext(
        baseContext, memFs.fs, logger
      );

      const results = await hookExecutor.executeHooks(hooks, enhancedContext);

      expect(results).toHaveLength(2); // Should stop after hook2 fails
      expect(results[0]?.success).toBe(true);
      expect(results[1]?.success).toBe(false);
      expect(hook1).toHaveBeenCalledTimes(1);
      expect(hook2).toHaveBeenCalledTimes(1);
      expect(hook3).not.toHaveBeenCalled(); // Should not be called due to failure
    });

    it('should continue execution on hook failure when continueOnError is true', async () => {
      const hook1 = mock(async () => {});
      const hook2 = mock(async () => { throw new Error('Hook2 failed'); });
      const hook3 = mock(async () => {});

      const hooks = [
        { name: 'hook1', hook: hook1 },
        { name: 'hook2', hook: hook2, options: { continueOnError: true } },
        { name: 'hook3', hook: hook3 },
      ];

      const enhancedContext = hookExecutor.createEnhancedContext(
        baseContext, memFs.fs, logger
      );

      const results = await hookExecutor.executeHooks(hooks, enhancedContext);

      expect(results).toHaveLength(3); // All hooks should be executed
      expect(results[0]?.success).toBe(true);
      expect(results[1]?.success).toBe(false);
      expect(results[2]?.success).toBe(true);
      expect(hook1).toHaveBeenCalledTimes(1);
      expect(hook2).toHaveBeenCalledTimes(1);
      expect(hook3).toHaveBeenCalledTimes(1); // Should be called despite hook2 failure
    });

    it('should handle mixed hook options correctly', async () => {
      const hook1 = mock(async () => { throw new Error('Hook1 failed'); });
      const hook2 = mock(async () => { throw new Error('Hook2 failed'); });
      const hook3 = mock(async () => {});

      const hooks = [
        { name: 'hook1', hook: hook1, options: { continueOnError: true } },
        { name: 'hook2', hook: hook2, options: { continueOnError: false } },
        { name: 'hook3', hook: hook3 },
      ];

      const enhancedContext = hookExecutor.createEnhancedContext(
        baseContext, memFs.fs, logger
      );

      const results = await hookExecutor.executeHooks(hooks, enhancedContext);

      expect(results).toHaveLength(2); // Should stop after hook2 fails
      expect(results[0]?.success).toBe(false); // hook1 failed but continued
      expect(results[1]?.success).toBe(false); // hook2 failed and stopped execution
      expect(hook1).toHaveBeenCalledTimes(1);
      expect(hook2).toHaveBeenCalledTimes(1);
      expect(hook3).not.toHaveBeenCalled(); // Should not be called due to hook2 failure
    });
  });

  describe('error handling and logging', () => {
    const baseContext: InstallHookContext = {
      toolName: 'test-tool',
      installDir: '/test/install/dir',
    };

    it('should log debug messages during hook execution', async () => {
      const mockHook = mock(async () => {});

      const enhancedContext = hookExecutor.createEnhancedContext(
        baseContext, memFs.fs, logger
      );

      await hookExecutor.executeHook('testHook', mockHook, enhancedContext);

      logger.expect(
        ['DEBUG'],
        ['HookExecutor'],
        [/Executing testHook hook with \d+ms timeout/]
      );
      logger.expect(
        ['DEBUG'],
        ['HookExecutor'],
        [expect.stringContaining('Hook testHook completed successfully in')]
      );
    });

    it('should log errors when hooks fail', async () => {
      const errorMessage = 'Test hook error';
      const mockHook = mock(async () => { throw new Error(errorMessage); });

      const enhancedContext = hookExecutor.createEnhancedContext(
        baseContext, memFs.fs, logger
      );

      await hookExecutor.executeHook('testHook', mockHook, enhancedContext);

      logger.expect(
        ['ERROR'],
        ['HookExecutor'],
        ['Installation failed [testHook hook] for tool "test-tool": Test hook error']
      );
    });

    it('should handle non-Error exceptions', async () => {
      const mockHook = mock(async () => { throw 'String error'; });

      const enhancedContext = hookExecutor.createEnhancedContext(
        baseContext, memFs.fs, logger
      );

      const result = await hookExecutor.executeHook('testHook', mockHook, enhancedContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('String error');
    });
  });
});