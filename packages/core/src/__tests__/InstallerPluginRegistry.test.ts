import { beforeEach, describe, expect, test } from 'bun:test';
import type { InstallContext } from '@dotfiles/core';
import { MemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { z } from 'zod';
import { InstallerPluginRegistry } from '../InstallerPluginRegistry';
import type { IInstallerPlugin, IInstallOptions, InstallResult, IValidationResult } from '../types';

const createMockPlugin = (method: string, options: Partial<IInstallerPlugin> = {}): IInstallerPlugin => {
  const plugin: IInstallerPlugin = {
    method,
    displayName: `${method} Plugin`,
    version: '1.0.0',
    paramsSchema: z.object({ param: z.string() }),
    toolConfigSchema: z.object({
      installationMethod: z.literal(method),
      installParams: z.object({ param: z.string() }),
    }),
    async install(): Promise<InstallResult> {
      return { success: true, metadata: { method } };
    },
    ...options,
  };
  return plugin;
};

const createMockContext = (): InstallContext => {
  const context: InstallContext = {
    toolName: 'test-tool',
    toolDir: '/tmp/test',
    homeDir: '/home/user',
    binDir: '/tmp/test/bin',
    shellScriptsDir: '/tmp/test/shell',
    dotfilesDir: '/home/user/dotfiles',
    generatedDir: '/tmp/test/generated',
    installDir: '/tmp/test',
    timestamp: '2025-01-01-00-00-00',
    getToolDir: (toolName: string) => `/tmp/${toolName}`,
    projectConfig: {} as never,
    systemInfo: {} as never,
    toolConfig: {} as never,
    $: (() => {}) as unknown as typeof import('bun').$,
    fileSystem: new MemFileSystem({}),
  };
  return context;
};

describe('InstallerPluginRegistry', () => {
  let logger: TestLogger;
  let registry: InstallerPluginRegistry;

  beforeEach(() => {
    logger = new TestLogger();
    registry = new InstallerPluginRegistry(logger);
  });

  describe('register', () => {
    test('registers a plugin successfully', async () => {
      const plugin = createMockPlugin('test-method');

      await registry.register(plugin);

      expect(registry.has('test-method')).toBe(true);
      expect(registry.get('test-method')).toBe(plugin);
    });

    test('throws on invalid plugin with no method', async () => {
      const plugin = createMockPlugin('');

      expect(registry.register(plugin)).rejects.toThrow('Plugin registration failed');
    });

    test('warns when replacing existing plugin', async () => {
      const plugin1 = createMockPlugin('test-method');
      const plugin2 = createMockPlugin('test-method');

      await registry.register(plugin1);
      await registry.register(plugin2);

      logger.expect(['WARN'], ['InstallerPluginRegistry'], ['Plugin test-method is already registered']);
      expect(registry.get('test-method')).toBe(plugin2);
    });

    test('calls plugin initialize if provided', async () => {
      let initialized = false;
      const plugin = createMockPlugin('test-method', {
        async initialize() {
          initialized = true;
        },
      });

      await registry.register(plugin);

      expect(initialized).toBe(true);
    });

    test('throws if schemas already composed', async () => {
      const plugin1 = createMockPlugin('method1');
      const plugin2 = createMockPlugin('method2');

      await registry.register(plugin1);
      await registry.register(plugin2);
      registry.composeSchemas();

      const plugin3 = createMockPlugin('method3');
      expect(registry.register(plugin3)).rejects.toThrow('Plugin registration failed: method3');
    });

    test('fails fast on initialization error', async () => {
      const plugin = createMockPlugin('test-method', {
        async initialize() {
          throw new Error('Init failed');
        },
      });

      expect(registry.register(plugin)).rejects.toThrow('Plugin registration failed: test-method');
    });
  });

  describe('get, has, getAll, getMethods', () => {
    test('get returns plugin if registered', async () => {
      const plugin = createMockPlugin('test-method');
      await registry.register(plugin);

      expect(registry.get('test-method')).toBe(plugin);
    });

    test('get returns undefined if not registered', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    test('has returns true if plugin registered', async () => {
      const plugin = createMockPlugin('test-method');
      await registry.register(plugin);

      expect(registry.has('test-method')).toBe(true);
    });

    test('has returns false if plugin not registered', () => {
      expect(registry.has('nonexistent')).toBe(false);
    });

    test('getAll returns all registered plugins', async () => {
      const plugin1 = createMockPlugin('method1');
      const plugin2 = createMockPlugin('method2');

      await registry.register(plugin1);
      await registry.register(plugin2);

      const plugins = registry.getAll();
      expect(plugins).toHaveLength(2);
      expect(plugins).toContain(plugin1);
      expect(plugins).toContain(plugin2);
    });

    test('getMethods returns all plugin methods', async () => {
      await registry.register(createMockPlugin('method1'));
      await registry.register(createMockPlugin('method2'));
      await registry.register(createMockPlugin('method3'));

      const methods = registry.getMethods();
      expect(methods).toEqual(['method1', 'method2', 'method3']);
    });
  });

  describe('composeSchemas', () => {
    test('composes schemas from multiple plugins', async () => {
      await registry.register(createMockPlugin('method1'));
      await registry.register(createMockPlugin('method2'));

      registry.composeSchemas();

      const toolConfigSchema = registry.getToolConfigSchema();
      const paramsSchema = registry.getInstallParamsSchema();

      expect(toolConfigSchema).toBeDefined();
      expect(paramsSchema).toBeDefined();
    });

    test('throws if no plugins registered', () => {
      expect(() => registry.composeSchemas()).toThrow('No plugins registered');
    });

    test('works with a single plugin', async () => {
      await registry.register(createMockPlugin('method1'));

      registry.composeSchemas();

      const toolConfigSchema = registry.getToolConfigSchema();
      const paramsSchema = registry.getInstallParamsSchema();

      expect(toolConfigSchema).toBeDefined();
      expect(paramsSchema).toBeDefined();
    });

    test('logs composition message', async () => {
      await registry.register(createMockPlugin('method1'));
      await registry.register(createMockPlugin('method2'));

      registry.composeSchemas();

      logger.expect(['INFO'], ['InstallerPluginRegistry'], [/Composed schemas from 2 plugins: method1, method2/]);
    });

    test('validates tool configs using composed schema', async () => {
      await registry.register(createMockPlugin('method1'));
      await registry.register(createMockPlugin('method2'));

      registry.composeSchemas();

      const schema = registry.getToolConfigSchema();

      const validConfig = {
        installationMethod: 'method1',
        installParams: { param: 'value' },
      };

      const result = schema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    test('rejects invalid tool configs', async () => {
      await registry.register(createMockPlugin('method1'));
      await registry.register(createMockPlugin('method2'));

      registry.composeSchemas();

      const schema = registry.getToolConfigSchema();

      const invalidConfig = {
        installationMethod: 'unknown-method',
        installParams: { param: 'value' },
      };

      const result = schema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });

  describe('getToolConfigSchema', () => {
    test('throws if schemas not composed', () => {
      expect(() => registry.getToolConfigSchema()).toThrow(
        'Schemas not composed. Call composeSchemas() after registering all plugins.'
      );
    });

    test('returns schema after composition', async () => {
      await registry.register(createMockPlugin('method1'));
      await registry.register(createMockPlugin('method2'));

      registry.composeSchemas();

      const schema = registry.getToolConfigSchema();
      expect(schema).toBeDefined();
    });
  });

  describe('getInstallParamsSchema', () => {
    test('throws if schemas not composed', () => {
      expect(() => registry.getInstallParamsSchema()).toThrow(
        'Schemas not composed. Call composeSchemas() after registering all plugins.'
      );
    });

    test('returns schema after composition', async () => {
      await registry.register(createMockPlugin('method1'));
      await registry.register(createMockPlugin('method2'));

      registry.composeSchemas();

      const schema = registry.getInstallParamsSchema();
      expect(schema).toBeDefined();
    });
  });

  describe('install', () => {
    test('delegates to appropriate plugin', async () => {
      let installCalled = false;
      const plugin = createMockPlugin('test-method', {
        async install(): Promise<InstallResult> {
          installCalled = true;
          return { success: true, metadata: { method: 'test-method' } };
        },
      });

      await registry.register(plugin);

      const context = createMockContext();
      const result = await registry.install('test-method', 'test-tool', {}, context);

      expect(installCalled).toBe(true);
      expect(result.success).toBe(true);
    });

    test('returns error if plugin not found', async () => {
      const context = createMockContext();
      const result = await registry.install('nonexistent', 'test-tool', {}, context);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('No plugin registered for installation method: nonexistent');
      }
    });

    test('validates plugin before installation if validate method provided', async () => {
      let validateCalled = false;
      const plugin = createMockPlugin('test-method', {
        async validate(): Promise<IValidationResult> {
          validateCalled = true;
          return { valid: true };
        },
      });

      await registry.register(plugin);

      const context = createMockContext();
      await registry.install('test-method', 'test-tool', {}, context);

      expect(validateCalled).toBe(true);
    });

    test('returns error if validation fails', async () => {
      const plugin = createMockPlugin('test-method', {
        async validate(): Promise<IValidationResult> {
          return {
            valid: false,
            errors: ['Validation error 1', 'Validation error 2'],
          };
        },
      });

      await registry.register(plugin);

      const context = createMockContext();
      const result = await registry.install('test-method', 'test-tool', {}, context);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Validation error 1, Validation error 2');
      }
    });

    test('logs validation warnings', async () => {
      const plugin = createMockPlugin('test-method', {
        async validate(): Promise<IValidationResult> {
          return {
            valid: true,
            warnings: ['Warning 1', 'Warning 2'],
          };
        },
      });

      await registry.register(plugin);

      const context = createMockContext();
      await registry.install('test-method', 'test-tool', {}, context);

      logger.expect(
        ['WARN'],
        ['InstallerPluginRegistry', 'install'],
        ['Validation warning for test-method: Warning 1', 'Validation warning for test-method: Warning 2']
      );
    });

    test('caches validation if staticValidation is true', async () => {
      let validateCallCount = 0;
      const plugin = createMockPlugin('test-method', {
        staticValidation: true,
        async validate(): Promise<IValidationResult> {
          validateCallCount++;
          return { valid: true };
        },
      });

      await registry.register(plugin);

      const context = createMockContext();
      await registry.install('test-method', 'test-tool', {}, context);
      await registry.install('test-method', 'test-tool', {}, context);
      await registry.install('test-method', 'test-tool', {}, context);

      expect(validateCallCount).toBe(1);
    });

    test('does not cache validation if staticValidation is false', async () => {
      let validateCallCount = 0;
      const plugin = createMockPlugin('test-method', {
        staticValidation: false,
        async validate(): Promise<IValidationResult> {
          validateCallCount++;
          return { valid: true };
        },
      });

      await registry.register(plugin);

      const context = createMockContext();
      await registry.install('test-method', 'test-tool', {}, context);
      await registry.install('test-method', 'test-tool', {}, context);
      await registry.install('test-method', 'test-tool', {}, context);

      expect(validateCallCount).toBe(3);
    });

    test('passes all parameters to plugin install', async () => {
      const options: IInstallOptions = { force: true };
      let receivedParams: unknown[] = [];

      const plugin = createMockPlugin('test-method', {
        async install(toolName, toolConfig, context, opts, subLogger): Promise<InstallResult> {
          receivedParams = [toolName, toolConfig, context, opts, subLogger];
          return { success: true, metadata: { method: 'test-method' } };
        },
      });

      await registry.register(plugin);

      const context = createMockContext();
      await registry.install('test-method', 'test-tool', { config: 'value' }, context, options);

      expect(receivedParams[0]).toBe('test-tool');
      expect(receivedParams[1]).toEqual({ config: 'value' });
      expect(receivedParams[2]).toBe(context);
      expect(receivedParams[3]).toBe(options);
      expect(receivedParams[4]).toBeDefined();
    });

    test('logs delegation message', async () => {
      const plugin = createMockPlugin('test-method');
      await registry.register(plugin);

      const context = createMockContext();
      await registry.install('test-method', 'test-tool', {}, context);

      logger.expect(
        ['DEBUG'],
        ['InstallerPluginRegistry', 'install'],
        ['Delegating installation to plugin: test-method']
      );
    });
  });

  describe('clearValidationCache', () => {
    test('clears validation cache', async () => {
      let validateCallCount = 0;
      const plugin = createMockPlugin('test-method', {
        staticValidation: true,
        async validate(): Promise<IValidationResult> {
          validateCallCount++;
          return { valid: true };
        },
      });

      await registry.register(plugin);

      const context = createMockContext();

      await registry.install('test-method', 'test-tool', {}, context);
      expect(validateCallCount).toBe(1);

      registry.clearValidationCache();

      await registry.install('test-method', 'test-tool', {}, context);
      expect(validateCallCount).toBe(2);
    });

    test('logs cache cleared message', () => {
      registry.clearValidationCache();

      logger.expect(['DEBUG'], ['InstallerPluginRegistry'], ['Validation cache cleared']);
    });
  });

  describe('cleanup', () => {
    test('calls cleanup on all plugins that have cleanup method', async () => {
      let cleanup1Called = false;
      let cleanup2Called = false;

      const plugin1 = createMockPlugin('method1', {
        async cleanup() {
          cleanup1Called = true;
        },
      });

      const plugin2 = createMockPlugin('method2', {
        async cleanup() {
          cleanup2Called = true;
        },
      });

      await registry.register(plugin1);
      await registry.register(plugin2);

      await registry.cleanup();

      expect(cleanup1Called).toBe(true);
      expect(cleanup2Called).toBe(true);
    });

    test('skips plugins without cleanup method', async () => {
      const plugin1 = createMockPlugin('method1');
      const plugin2 = createMockPlugin('method2', {
        async cleanup() {},
      });

      await registry.register(plugin1);
      await registry.register(plugin2);

      await registry.cleanup();

      expect(true).toBe(true);
    });

    test('logs cleanup messages', async () => {
      const plugin = createMockPlugin('test-method', {
        async cleanup() {},
      });

      await registry.register(plugin);

      await registry.cleanup();

      logger.expect(
        ['INFO', 'DEBUG'],
        ['InstallerPluginRegistry', 'cleanup'],
        ['Cleaning up plugins...', 'Cleaned up plugin: test-method', 'Plugin cleanup complete']
      );
    });

    test('continues cleanup even if one plugin fails', async () => {
      let cleanup2Called = false;

      const plugin1 = createMockPlugin('method1', {
        async cleanup() {
          throw new Error('Cleanup failed');
        },
      });

      const plugin2 = createMockPlugin('method2', {
        async cleanup() {
          cleanup2Called = true;
        },
      });

      await registry.register(plugin1);
      await registry.register(plugin2);

      await registry.cleanup();

      expect(cleanup2Called).toBe(true);
      logger.expect(['ERROR'], ['InstallerPluginRegistry', 'cleanup'], ['Failed to cleanup plugin method1']);
    });
  });
});
