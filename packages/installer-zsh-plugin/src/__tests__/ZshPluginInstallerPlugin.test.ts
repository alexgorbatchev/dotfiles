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
      },
    };

    const result = plugin.toolConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it('should support update check', () => {
    expect(plugin.supportsUpdateCheck()).toBe(true);
  });

  it('should support update', () => {
    expect(plugin.supportsUpdate()).toBe(true);
  });

  it('should not support readme', () => {
    expect(plugin.supportsReadme()).toBe(false);
  });

  it('should not be externally managed', () => {
    expect(plugin.externallyManaged).toBe(false);
  });
});
