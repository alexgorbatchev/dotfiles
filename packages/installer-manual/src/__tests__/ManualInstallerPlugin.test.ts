import { beforeEach, describe, expect, it } from 'bun:test';
import { TestLogger } from '@dotfiles/logger';
import type { ManualToolConfig } from '@dotfiles/schemas';
import { ManualInstallerPlugin } from '../ManualInstallerPlugin';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor } from '@dotfiles/installer';

describe('ManualInstallerPlugin', () => {
  let logger: TestLogger;
  let plugin: ManualInstallerPlugin;
  let mockFs: IFileSystem;
  let mockHookExecutor: HookExecutor;

  beforeEach(() => {
    logger = new TestLogger();
    mockFs = {} as IFileSystem;
    mockHookExecutor = {} as HookExecutor;
    
    plugin = new ManualInstallerPlugin(logger, mockFs, mockHookExecutor);
  });

  it('should have correct plugin metadata', () => {
    expect(plugin.method).toBe('manual');
    expect(plugin.displayName).toBe('Manual Installer');
    expect(plugin.version).toBe('1.0.0');
  });

  it('should have valid schemas', () => {
    expect(plugin.paramsSchema).toBeDefined();
    expect(plugin.toolConfigSchema).toBeDefined();
  });

  it('should validate correct params', () => {
    const validParams = {};

    const result = plugin.paramsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should validate correct tool config', () => {
    const validConfig: ManualToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      binaries: ['test-tool'],
      installationMethod: 'manual',
      installParams: {},
    };

    const result = plugin.toolConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });
});
