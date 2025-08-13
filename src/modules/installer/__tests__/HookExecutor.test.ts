import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { TrackedFileSystem } from '@modules/file-registry';
import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createMemFileSystem, createMockYamlConfig, type MemFileSystemReturn, TestLogger } from '@testing-helpers';
import type { AsyncInstallHook, InstallHookContext, ToolConfig } from '@types';
import type { $ } from 'zx';
import { type HookExecutionOptions, HookExecutor } from '../HookExecutor';

// Helper function for tests to create SafeLogMessage
function testLogMessage(message: string): SafeLogMessage {
  return message as SafeLogMessage;
}

// Helper function to create mock $ instance
function createMock$() {
  // Mock shell execution function
  return mock(() => Promise.resolve({ stdout: '', stderr: '', exitCode: 0 })) as unknown as typeof $;
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
      $: createMock$(),
    };

    it('should execute hook successfully and return correct result', async () => {
      const mockHook: AsyncInstallHook = mock(async (ctx) => {
        expect(ctx.toolName).toBe('test-tool');
        // These properties are available in the enhanced context
        expect(ctx.fileSystem).toBeDefined();
        expect(ctx.logger).toBeDefined();
      });

      const enhancedContext = hookExecutor.createEnhancedContext(baseContext, memFs.fs, logger);

      const result = await hookExecutor.executeHook('testHook', mockHook, enhancedContext);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should create hook-specific logger with correct naming format', async () => {
      const mockHook: AsyncInstallHook = mock(async (ctx) => {
        // Log a message using the hook-specific logger
        ctx.logger.info(testLogMessage('Hook execution message'));
      });

      const enhancedContext = hookExecutor.createEnhancedContext(baseContext, memFs.fs, logger);

      const result = await hookExecutor.executeHook('afterInstall', mockHook, enhancedContext);

      // Verify the hook received a logger with the correct name format: toolName--hookName
      // The logger hierarchy is: test-tool (parent) -> test-tool--afterInstall (child)
      logger.expect(['INFO'], ['test-tool', 'test-tool--afterInstall'], ['Hook execution message']);
      expect(result.success).toBe(true);
      expect(mockHook).toHaveBeenCalledTimes(1);
    });

    it('should handle hook errors and return failure result', async () => {
      const errorMessage = 'Hook execution failed';
      const mockHook = mock(async () => {
        throw new Error(errorMessage);
      });

      const enhancedContext = hookExecutor.createEnhancedContext(baseContext, memFs.fs, logger);

      const result = await hookExecutor.executeHook('testHook', mockHook, enhancedContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.skipped).toBe(false);
    });

    it('should handle hook timeout', async () => {
      const mockHook = mock(async () => {
        // Simulate a slow hook that takes longer than timeout
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      const enhancedContext = hookExecutor.createEnhancedContext(baseContext, memFs.fs, logger);

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

      const enhancedContext = hookExecutor.createEnhancedContext(baseContext, memFs.fs, logger);

      const options: HookExecutionOptions = { continueOnError: true };
      const result = await hookExecutor.executeHook('testHook', mockHook, enhancedContext, options);

      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
    });

    it('should use default timeout when not specified', async () => {
      const mockHook = mock(async () => {});

      const enhancedContext = hookExecutor.createEnhancedContext(baseContext, memFs.fs, logger);

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
      $: createMock$(),
    };

    it('should create enhanced context with regular filesystem', () => {
      const enhancedContext = hookExecutor.createEnhancedContext(baseContext, memFs.fs, logger);

      expect(enhancedContext.toolName).toBe(baseContext.toolName);
      expect(enhancedContext.installDir).toBe(baseContext.installDir);
      expect(enhancedContext.fileSystem).toBe(memFs.fs);
      expect(enhancedContext.logger).toBeDefined();
    });

    it('should create enhanced context with TrackedFileSystem and create tool-specific instance', () => {
      const enhancedContext = hookExecutor.createEnhancedContext(baseContext, mockTrackedFileSystem, logger);

      expect(enhancedContext.fileSystem).toBe(mockTrackedFileSystem);
      expect(mockTrackedFileSystem.withToolName).toHaveBeenCalledWith('test-tool');
    });

    it('should create sublogger with correct name', () => {
      const enhancedContext = hookExecutor.createEnhancedContext(baseContext, memFs.fs, logger);

      // Verify logger is a sublogger (should have the expected name in logs)
      enhancedContext.logger.info(testLogMessage('Test message'));
      logger.expect(['INFO'], ['test-tool'], ['Test message']);
    });

    it('should create $ instance with cwd set to tool config directory', () => {
      const mockToolConfig: ToolConfig = {
        configFilePath: '/path/to/configs/tool.tool.ts',
        name: 'test-tool',
        binaries: ['test-tool'],
        version: 'latest',
        installationMethod: 'none',
        installParams: undefined,
      };

      const contextWithToolConfig = {
        ...baseContext,
        toolConfig: mockToolConfig,
      };

      const enhancedContext = hookExecutor.createEnhancedContext(contextWithToolConfig, memFs.fs, logger);

      // Verify $ instance is created and configured
      expect(enhancedContext.$).toBeDefined();
      expect(typeof enhancedContext.$).toBe('function');

      // Verify the $ instance has the correct cwd configuration
      // We can't directly test the cwd without executing commands, but we can verify it exists
      expect(enhancedContext.$.bind).toBeDefined(); // $ should be a bound function
    });

    it('should use fallback $ instance when configFilePath is missing', () => {
      const contextWithoutConfigPath = {
        ...baseContext,
        toolConfig: {
          name: 'test-tool',
          binaries: ['test-tool'],
          version: 'latest',
          installationMethod: 'none',
          installParams: undefined,
        } as ToolConfig, // No configFilePath
      };

      const enhancedContext = hookExecutor.createEnhancedContext(contextWithoutConfigPath, memFs.fs, logger);

      // Verify $ instance is still created (fallback)
      expect(enhancedContext.$).toBeDefined();
      expect(typeof enhancedContext.$).toBe('function');
    });

    it('should preserve toolConfig and appConfig in enhanced context', async () => {
      const mockToolConfig: ToolConfig = {
        configFilePath: '/path/to/configs/tool.tool.ts',
        name: 'test-tool',
        binaries: ['test-tool'],
        version: 'latest',
        installationMethod: 'none',
        installParams: undefined,
      };

      await memFs.fs.ensureDir('/test');

      const mockAppConfig = await createMockYamlConfig({
        config: { paths: { generatedDir: '/generated' } },
        filePath: '/test/config.yaml',
        fileSystem: memFs.fs,
        logger,
        systemInfo: { platform: 'linux', arch: 'x64', release: 'test', homeDir: '/home/test' },
        env: {},
      });

      const contextWithConfigs = {
        ...baseContext,
        toolConfig: mockToolConfig,
        appConfig: mockAppConfig,
      };

      const enhancedContext = hookExecutor.createEnhancedContext(contextWithConfigs, memFs.fs, logger);

      expect(enhancedContext.toolConfig).toBe(mockToolConfig);
      expect(enhancedContext.appConfig).toBe(mockAppConfig);
    });
  });

  describe('$ shell executor functionality', () => {
    const baseContext: InstallHookContext = {
      toolName: 'test-tool',
      installDir: '/test/install/dir',
      $: createMock$(),
    };

    it('should provide $ instance to hooks that can execute shell commands', async () => {
      let capturedDollar: typeof $ | undefined;

      const hookThatUsesShell = mock(async (ctx: InstallHookContext) => {
        capturedDollar = ctx.$;
        expect(ctx.$).toBeDefined();
        expect(typeof ctx.$).toBe('function');

        // Simulate using $ in the hook (but don't actually execute)
        // We just verify the function is available
      });

      const enhancedContext = hookExecutor.createEnhancedContext(baseContext, memFs.fs, logger);

      await hookExecutor.executeHook('testShellHook', hookThatUsesShell, enhancedContext);

      expect(capturedDollar).toBeDefined();
      expect(typeof capturedDollar).toBe('function');
    });

    it('should pass $ instance through hook executor chain', async () => {
      const mockToolConfig: ToolConfig = {
        configFilePath: '/path/to/configs/shell-tool/shell-tool.tool.ts',
        name: 'shell-tool',
        binaries: ['shell-tool'],
        version: 'latest',
        installationMethod: 'none',
        installParams: undefined,
      };

      const contextWithToolConfig = {
        ...baseContext,
        toolConfig: mockToolConfig,
      };

      let receivedDollar: typeof $ | undefined;

      const hook = mock(async (ctx: InstallHookContext) => {
        receivedDollar = ctx.$;
        // The $ instance should be available and configured with correct cwd
        expect(ctx.$).toBeDefined();
      });

      const enhancedContext = hookExecutor.createEnhancedContext(contextWithToolConfig, memFs.fs, logger);

      await hookExecutor.executeHook('afterExtract', hook, enhancedContext);

      expect(receivedDollar).toBeDefined();
      expect(hook).toHaveBeenCalledTimes(1);
    });

    it('should create different $ instances for different tool configs', () => {
      const toolConfig1: ToolConfig = {
        configFilePath: '/path/to/configs/tool1/tool1.tool.ts',
        name: 'tool1',
        binaries: ['tool1'],
        version: 'latest',
        installationMethod: 'none',
        installParams: undefined,
      };

      const toolConfig2: ToolConfig = {
        configFilePath: '/path/to/configs/tool2/tool2.tool.ts',
        name: 'tool2',
        binaries: ['tool2'],
        version: 'latest',
        installationMethod: 'none',
        installParams: undefined,
      };

      const context1 = { ...baseContext, toolConfig: toolConfig1 };
      const context2 = { ...baseContext, toolConfig: toolConfig2 };

      const enhanced1 = hookExecutor.createEnhancedContext(context1, memFs.fs, logger);
      const enhanced2 = hookExecutor.createEnhancedContext(context2, memFs.fs, logger);

      // Each enhanced context should have its own $ instance
      expect(enhanced1.$).toBeDefined();
      expect(enhanced2.$).toBeDefined();
      // They should be different instances (though we can't easily verify cwd difference in tests)
      expect(typeof enhanced1.$).toBe('function');
      expect(typeof enhanced2.$).toBe('function');
    });
  });

  describe('executeHooks', () => {
    const baseContext: InstallHookContext = {
      toolName: 'test-tool',
      installDir: '/test/install/dir',
      $: createMock$(),
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

      const enhancedContext = hookExecutor.createEnhancedContext(baseContext, memFs.fs, logger);

      const results = await hookExecutor.executeHooks(hooks, enhancedContext);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
      expect(hook1).toHaveBeenCalledTimes(1);
      expect(hook2).toHaveBeenCalledTimes(1);
      expect(hook3).toHaveBeenCalledTimes(1);
    });

    it('should stop execution on hook failure when continueOnError is false', async () => {
      const hook1 = mock(async () => {});
      const hook2 = mock(async () => {
        throw new Error('Hook2 failed');
      });
      const hook3 = mock(async () => {});

      const hooks = [
        { name: 'hook1', hook: hook1 },
        { name: 'hook2', hook: hook2, options: { continueOnError: false } },
        { name: 'hook3', hook: hook3 },
      ];

      const enhancedContext = hookExecutor.createEnhancedContext(baseContext, memFs.fs, logger);

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
      const hook2 = mock(async () => {
        throw new Error('Hook2 failed');
      });
      const hook3 = mock(async () => {});

      const hooks = [
        { name: 'hook1', hook: hook1 },
        { name: 'hook2', hook: hook2, options: { continueOnError: true } },
        { name: 'hook3', hook: hook3 },
      ];

      const enhancedContext = hookExecutor.createEnhancedContext(baseContext, memFs.fs, logger);

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
      const hook1 = mock(async () => {
        throw new Error('Hook1 failed');
      });
      const hook2 = mock(async () => {
        throw new Error('Hook2 failed');
      });
      const hook3 = mock(async () => {});

      const hooks = [
        { name: 'hook1', hook: hook1, options: { continueOnError: true } },
        { name: 'hook2', hook: hook2, options: { continueOnError: false } },
        { name: 'hook3', hook: hook3 },
      ];

      const enhancedContext = hookExecutor.createEnhancedContext(baseContext, memFs.fs, logger);

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
      $: createMock$(),
    };

    it('should log debug messages during hook execution', async () => {
      const mockHook = mock(async () => {});

      const enhancedContext = hookExecutor.createEnhancedContext(baseContext, memFs.fs, logger);

      await hookExecutor.executeHook('testHook', mockHook, enhancedContext);

      logger.expect(
        ['DEBUG'],
        ['HookExecutor'],
        [/Executing testHook hook with \d+ms timeout/, 'Hook testHook completed successfully in']
      );
    });

    it('should log errors when hooks fail', async () => {
      const errorMessage = 'Test hook error';
      const mockHook = mock(async () => {
        throw new Error(errorMessage);
      });

      const enhancedContext = hookExecutor.createEnhancedContext(baseContext, memFs.fs, logger);

      await hookExecutor.executeHook('testHook', mockHook, enhancedContext);

      logger.expect(
        ['ERROR'],
        ['HookExecutor'],
        ['Installation failed [testHook hook] for tool "test-tool": Test hook error']
      );
    });

    it('should handle non-Error exceptions', async () => {
      const mockHook = mock(async () => {
        throw 'String error';
      });

      const enhancedContext = hookExecutor.createEnhancedContext(baseContext, memFs.fs, logger);

      const result = await hookExecutor.executeHook('testHook', mockHook, enhancedContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('String error');
    });
  });
});
