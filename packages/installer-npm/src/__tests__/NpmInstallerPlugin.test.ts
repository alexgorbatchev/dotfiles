import { createShell } from '@dotfiles/core';
import type { NpmToolConfig } from '@dotfiles/installer-npm';
import { beforeEach, describe, expect, it } from 'bun:test';
import { NpmInstallerPlugin } from '../NpmInstallerPlugin';

const shell = createShell();

describe('NpmInstallerPlugin', () => {
  let plugin: NpmInstallerPlugin;

  beforeEach(() => {
    plugin = new NpmInstallerPlugin(shell);
  });

  it('should have correct plugin metadata', () => {
    expect(plugin.method).toBe('npm');
    expect(plugin.displayName).toBe('npm Installer');
    expect(plugin.version).toBe('1.0.0');
  });

  it('should have valid schemas', () => {
    expect(plugin.paramsSchema).toBeDefined();
    expect(plugin.toolConfigSchema).toBeDefined();
  });

  it('should validate correct params', () => {
    const validParams = {
      package: 'prettier',
    };

    const result = plugin.paramsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should validate params with version', () => {
    const validParams = {
      package: 'prettier',
      version: '3.0.0',
    };

    const result = plugin.paramsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should validate empty params', () => {
    const validParams = {};

    const result = plugin.paramsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should validate correct tool config', () => {
    const validConfig: NpmToolConfig = {
      name: 'prettier',
      version: '3.0.0',
      binaries: ['prettier'],
      installationMethod: 'npm',
      installParams: {
        package: 'prettier',
      },
    };

    const result = plugin.toolConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it('should reject invalid installation method', () => {
    const invalidConfig = {
      name: 'prettier',
      version: '3.0.0',
      binaries: ['prettier'],
      installationMethod: 'github-release',
      installParams: {
        package: 'prettier',
      },
    };

    const result = plugin.toolConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  it('should support updates', () => {
    expect(plugin.supportsUpdate()).toBe(true);
  });

  it('should support update checks', () => {
    expect(plugin.supportsUpdateCheck()).toBe(true);
  });

  it('should not support readme', () => {
    expect(plugin.supportsReadme()).toBe(false);
  });
});
