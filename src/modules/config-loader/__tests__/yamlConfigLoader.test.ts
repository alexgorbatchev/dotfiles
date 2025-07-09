/**
 * @file src/modules/config-loader/__tests__/yamlConfigLoader.test.ts
 * @description Unit tests for the YamlConfigLoader.
 *
 * ## Development Plan
 *
 * ### Mandatory Pre-read:
 * - `src/modules/config-loader/YamlConfigLoader.ts`
 * - `src/config/default-config.yaml`
 * - `src/types/config.yaml.types.ts`
 * - `src/modules/config/config.yaml.schema.ts`
 * - `src/types/platform.types.ts`
 *
 * ### Tasks:
 * - [x] Import necessary modules and types.
 * - [x] Refactor tests to use `createMemFileSystem` for simpler mocking.
 * - [x] Refactor tests to use `createYamlConfigFromFileSystem`.
 * - [x] Remove global mock of `yamlConfigSchema.parse` and apply mocks only where needed.
 * - [x] Test scenario: Loading default config only (no user config).
 * - [x] Test scenario: Loading and merging default config with user config.
 * - [x] Test scenario: Platform-specific overrides from user config are correctly applied.
 * - [x] Test scenario: No platform-specific overrides are applied when none are defined.
 * - [x] Test scenario: Token substitution for environment variables.
 * - [x] Test scenario: Token substitution for config references.
 * - [x] Test scenario: Error handling when default config file does not exist.
 * - [x] Test scenario: Error handling when user config file does not exist (covered by `createYamlConfigFromFileSystem` behavior).
 * - [x] Test scenario: Error handling when config validation fails.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { createMemFileSystem } from '@testing-helpers';
import { describe, expect, it } from 'bun:test';
import {
  createYamlConfigFromFileSystem,
  getDefaultConfigPath,
  loadDefaultYamlConfigAsRecord,
} from '../yamlConfigLoader';
import { MOCK_DEFAULT_CONFIG } from './fixtures';

describe('yamlConfigLoader', () => {
  const USER_CONFIG_PATH = '/test/config.yaml';

  const MOCK_USER_CONFIG = `
paths:
  dotfilesDir: ~/custom-dotfiles
  targetDir: /custom/bin
github:
  token: user-github-token
`;

  const MOCK_USER_CONFIG_WITH_PLATFORM = `
platform:
  - match:
      - os: macos
    config:
      paths:
        targetDir: /opt/homebrew/bin
  - match:
      - os: linux
        arch: arm64
    config:
      downloader:
        timeout: 600000
`;

  it('should load default config when user config does not exist', async () => {
    const fileSystem = createMemFileSystem({
      [getDefaultConfigPath()]: MOCK_DEFAULT_CONFIG,
    });

    const result = await loadDefaultYamlConfigAsRecord(fileSystem) as any;

    expect(result.paths?.toolConfigsDir).toBe('${paths.dotfilesDir}/generator/configs/tools');
    expect(result.github?.token).toBe('${GITHUB_TOKEN}');
  });

  it('should merge default config with user config', async () => {
    const fileSystem = createMemFileSystem({
      [getDefaultConfigPath()]: MOCK_DEFAULT_CONFIG,
      [USER_CONFIG_PATH]: MOCK_USER_CONFIG,
    });

    const systemInfo = {
      homedir: '/home/testuser',
      cwd: '/home/testuser/project',
      platform: 'linux',
      arch: 'x64',
    } as const;
    const env = { GITHUB_TOKEN: 'test-token' };

    const result = await createYamlConfigFromFileSystem(
      fileSystem,
      USER_CONFIG_PATH,
      systemInfo,
      env
    );

    expect(result.paths.dotfilesDir).toBe('~/custom-dotfiles');
    expect(result.paths.targetDir).toBe('/custom/bin');
    expect(result.github.token).toBe('user-github-token');
    expect(result.logging.debug).toBe('');
    expect(result.updates.checkOnRun).toBe(true);
  });

  it('should apply platform-specific overrides from user config', async () => {
    const fileSystem = createMemFileSystem({
      [getDefaultConfigPath()]: MOCK_DEFAULT_CONFIG,
      [USER_CONFIG_PATH]: MOCK_USER_CONFIG_WITH_PLATFORM,
    });

    // Test for macOS
    const macSystemInfo = {
      homedir: '/home/testuser',
      cwd: '/home/testuser/project',
      platform: 'darwin',
      arch: 'x64',
    } as const;
    const macResult = await createYamlConfigFromFileSystem(
      fileSystem,
      USER_CONFIG_PATH,
      macSystemInfo,
      {}
    );
    expect(macResult.paths.targetDir).toBe('/opt/homebrew/bin');
    expect(macResult.platform).toBeUndefined();

    // Test for Linux ARM64
    const linuxSystemInfo = {
      homedir: '/home/testuser',
      cwd: '/home/testuser/project',
      platform: 'linux',
      arch: 'arm64',
    } as const;
    const linuxResult = await createYamlConfigFromFileSystem(
      fileSystem,
      USER_CONFIG_PATH,
      linuxSystemInfo,
      {}
    );
    expect(linuxResult.downloader.timeout).toBe(600000);
  });

  it('should not apply platform overrides if none are defined', async () => {
    const fileSystem = createMemFileSystem({
      [getDefaultConfigPath()]: MOCK_DEFAULT_CONFIG,
      [USER_CONFIG_PATH]: MOCK_USER_CONFIG,
    });

    const systemInfo = {
      homedir: '/home/testuser',
      cwd: '/home/testuser/project',
      platform: 'darwin',
      arch: 'x64',
    } as const;
    const env = { GITHUB_TOKEN: 'test-token' };

    const result = await createYamlConfigFromFileSystem(
      fileSystem,
      USER_CONFIG_PATH,
      systemInfo,
      env
    );

    // It should use the value from the merged user/default config, not an override
    expect(result.paths.targetDir).toBe('/custom/bin');
    expect(result.platform).toBeUndefined();
  });

  it('should substitute environment variables in config', async () => {
    const fileSystem = createMemFileSystem({
      [getDefaultConfigPath()]: MOCK_DEFAULT_CONFIG,
    });

    const systemInfo = {
      homedir: '/home/testuser',
      cwd: '/home/testuser/project',
      platform: 'linux',
      arch: 'x64',
    } as const;
    const env = { GITHUB_TOKEN: 'env-github-token' };

    const result = await createYamlConfigFromFileSystem(
      fileSystem,
      USER_CONFIG_PATH, // non-existent
      systemInfo,
      env
    );

    expect(result.github.token).toBe('env-github-token');
  });

  it('should substitute config references in config', async () => {
    const fileSystem = createMemFileSystem({
      [getDefaultConfigPath()]: MOCK_DEFAULT_CONFIG,
      [USER_CONFIG_PATH]: MOCK_USER_CONFIG,
    });

    const result = await createYamlConfigFromFileSystem(
      fileSystem,
      USER_CONFIG_PATH,
      {
        // homedir: '/home/testuser',
        // cwd: '/home/testuser/project',
        platform: 'linux',
        arch: 'x64',
      },
      {}
    );

    expect(result.paths.generatedDir).toBe('~/custom-dotfiles/.generated');
    expect(result.paths.toolConfigsDir).toBe('~/custom-dotfiles/generator/configs/tools');
    expect(result.paths.completionsDir).toBe('~/custom-dotfiles/.generated/completions');
    expect(result.paths.manifestPath).toBe('~/custom-dotfiles/.generated/generated-manifest.json');
  });

  it('should throw an error when default config file does not exist', async () => {
    const fileSystem = createMemFileSystem({});

    expect(
      createYamlConfigFromFileSystem(fileSystem, USER_CONFIG_PATH, {} as any, {})
    ).rejects.toThrow();
  });

  it('should handle validation errors from yamlConfigSchema', async () => {
    const MOCK_INVALID_USER_CONFIG = `
github:
  token: 12345
`;
    const fileSystem = createMemFileSystem({
      [getDefaultConfigPath()]: MOCK_DEFAULT_CONFIG,
      [USER_CONFIG_PATH]: MOCK_INVALID_USER_CONFIG,
    });

    const systemInfo = {
      homedir: '/home/testuser',
      cwd: '/home/testuser/project',
      platform: 'linux',
      arch: 'x64',
    } as const;
    const env = {};

    expect(
      createYamlConfigFromFileSystem(fileSystem, USER_CONFIG_PATH, systemInfo, env)
    ).rejects.toThrow(/YAML configuration is invalid/);
  });
});
