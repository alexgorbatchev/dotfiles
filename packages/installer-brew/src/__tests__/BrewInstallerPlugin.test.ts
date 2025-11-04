import { beforeEach, describe, expect, it } from 'bun:test';
import type { BrewToolConfig } from '@dotfiles/installer-brew';
import { TestLogger } from '@dotfiles/logger';
import { BrewInstallerPlugin } from '../BrewInstallerPlugin';

describe('BrewInstallerPlugin', () => {
  let logger: TestLogger;
  let plugin: BrewInstallerPlugin;

  beforeEach(() => {
    logger = new TestLogger();
    plugin = new BrewInstallerPlugin(logger);
  });

  it('should have correct plugin metadata', () => {
    expect(plugin.method).toBe('brew');
    expect(plugin.displayName).toBe('Homebrew Installer');
    expect(plugin.version).toBe('1.0.0');
  });

  it('should have valid schemas', () => {
    expect(plugin.paramsSchema).toBeDefined();
    expect(plugin.toolConfigSchema).toBeDefined();
  });

  it('should validate correct params', () => {
    const validParams = {
      formula: 'test-tool',
      cask: false,
    };

    const result = plugin.paramsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should validate correct tool config', () => {
    const validConfig: BrewToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      binaries: ['test-tool'],
      installationMethod: 'brew',
      installParams: {
        formula: 'test-tool',
      },
    };

    const result = plugin.toolConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it('should reject invalid installation method', () => {
    const invalidConfig = {
      name: 'test-tool',
      version: '1.0.0',
      binaries: ['test-tool'],
      installationMethod: 'github-release',
      installParams: {
        formula: 'test-tool',
      },
    };

    const result = plugin.toolConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });
});
