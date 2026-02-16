import type { Shell } from '@dotfiles/core';
import type { IResolvedFileSystem } from '@dotfiles/file-system';
import type { ZshPluginToolConfig } from '@dotfiles/installer-zsh-plugin';
import { beforeEach, describe, expect, it } from 'bun:test';
import { ZshPluginInstallerPlugin } from '../ZshPluginInstallerPlugin';

describe('ZshPluginInstallerPlugin', () => {
  let plugin: ZshPluginInstallerPlugin;
  let mockFs: IResolvedFileSystem;
  let mockShell: Shell;

  beforeEach(() => {
    mockFs = {} as IResolvedFileSystem;
    mockShell = (() => {}) as unknown as Shell;

    plugin = new ZshPluginInstallerPlugin(mockFs, mockShell);
  });

  it('should have correct plugin metadata', () => {
    expect(plugin.method).toBe('zsh-plugin');
    expect(plugin.displayName).toBe('Zsh Plugin Installer');
    expect(plugin.version).toBe('1.0.0');
  });

  it('should have valid schemas', () => {
    expect(plugin.paramsSchema).toBeDefined();
    expect(plugin.toolConfigSchema).toBeDefined();
  });

  it('should validate params with repo', () => {
    const validParams = { repo: 'user/repo' };

    const result = plugin.paramsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should validate params with url', () => {
    const validParams = { url: 'https://github.com/user/repo.git' };

    const result = plugin.paramsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should reject params without repo or url', () => {
    const invalidParams = {};

    const result = plugin.paramsSchema.safeParse(invalidParams);
    expect(result.success).toBe(false);
  });

  it('should reject invalid repo format', () => {
    const invalidParams = { repo: 'invalid-format' };

    const result = plugin.paramsSchema.safeParse(invalidParams);
    expect(result.success).toBe(false);
  });

  it('should validate params with custom pluginName', () => {
    const validParams = {
      repo: 'user/repo',
      pluginName: 'custom-name',
    };

    const result = plugin.paramsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should validate correct tool config', () => {
    const validConfig: ZshPluginToolConfig = {
      name: 'test-plugin',
      version: '1.0.0',
      binaries: [],
      installationMethod: 'zsh-plugin',
      installParams: {
        repo: 'user/repo',
        auto: true,
      },
    };

    const result = plugin.toolConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it('should support update', () => {
    expect(plugin.supportsUpdate()).toBe(true);
  });

  it('should support update check', () => {
    expect(plugin.supportsUpdateCheck()).toBe(true);
  });

  it('should not support readme', () => {
    expect(plugin.supportsReadme()).toBe(false);
  });

  it('should not be externally managed', () => {
    expect(plugin.externallyManaged).toBe(false);
  });

  describe('getShellInit', () => {
    it('should return shell init with source command for repo-based plugin', () => {
      const toolConfig: ZshPluginToolConfig = {
        name: 'zsh-vi-mode',
        version: '1.0.0',
        binaries: [],
        installationMethod: 'zsh-plugin',
        installParams: {
          repo: 'jeffreytse/zsh-vi-mode',
          auto: true,
        },
      };

      const result = plugin.getShellInit('zsh-vi-mode', toolConfig, '/home/user/.dotfiles/plugins');

      expect(result).toBeDefined();
      expect(result?.zsh?.scripts).toHaveLength(1);
      expect(result?.zsh?.scripts?.[0]).toEqual({
        kind: 'raw',
        value: 'source "/home/user/.dotfiles/plugins/zsh-vi-mode/zsh-vi-mode.plugin.zsh"',
      });
    });

    it('should return shell init with custom source file', () => {
      const toolConfig: ZshPluginToolConfig = {
        name: 'custom-plugin',
        version: '1.0.0',
        binaries: [],
        installationMethod: 'zsh-plugin',
        installParams: {
          repo: 'user/custom-plugin',
          source: 'init.zsh',
          auto: true,
        },
      };

      const result = plugin.getShellInit('custom-plugin', toolConfig, '/plugins');

      expect(result).toBeDefined();
      expect(result?.zsh?.scripts?.[0]).toEqual({
        kind: 'raw',
        value: 'source "/plugins/custom-plugin/init.zsh"',
      });
    });

    it('should return shell init with custom pluginName', () => {
      const toolConfig: ZshPluginToolConfig = {
        name: 'my-tool',
        version: '1.0.0',
        binaries: [],
        installationMethod: 'zsh-plugin',
        installParams: {
          repo: 'user/repo',
          pluginName: 'custom-name',
          auto: true,
        },
      };

      const result = plugin.getShellInit('my-tool', toolConfig, '/plugins');

      expect(result).toBeDefined();
      expect(result?.zsh?.scripts?.[0]).toEqual({
        kind: 'raw',
        value: 'source "/plugins/custom-name/custom-name.plugin.zsh"',
      });
    });

    it('should return undefined when installParams is missing', () => {
      const toolConfig = {
        name: 'test',
        version: '1.0.0',
        binaries: [],
        installationMethod: 'zsh-plugin',
        installParams: undefined,
      } as unknown as ZshPluginToolConfig;

      const result = plugin.getShellInit('test', toolConfig, '/plugins');

      expect(result).toBeUndefined();
    });
  });
});
