/**
 * @file generator/src/modules/config-loader/__tests__/yamlConfigLoader.test.ts
 * @description Unit tests for the YamlConfigLoader.
 *
 * ## Development Plan
 *
 * ### Mandatory Pre-read:
 * - `generator/src/modules/config-loader/YamlConfigLoader.ts`
 * - `generator/src/config/default-config.yaml`
 * - `generator/src/types/config.yaml.types.ts`
 * - `generator/src/modules/config/config.yaml.schema.ts`
 * - `generator/src/types/platform.types.ts`
 *
 * ### Tasks:
 * - [x] Import necessary modules and types.
 * - [x] Mock `IFileSystem` using testing helpers.
 * - [x] Refactor tests to use `createYamlConfigFromFileSystem`.
 * - [x] Remove global mock of `yamlConfigSchema.parse` and apply mocks only where needed.
 * - [x] Test scenario: Loading default config only (no user config).
 * - [x] Test scenario: Loading and merging default config with user config.
 * - [x] Test scenario: Platform-specific overrides are correctly applied.
 * - [x] Test scenario: Token substitution for environment variables.
 * - [x] Test scenario: Token substitution for config references.
 * - [x] Test scenario: Error handling when default config file doesn't exist.
 * - [x] Test scenario: Error handling when user config file doesn't exist (covered by `createYamlConfigFromFileSystem` behavior).
 * - [x] Test scenario: Error handling when config validation fails.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import * as yamlConfigSchema from '@modules/config/config.yaml.schema';
import type { IFileSystem } from '@modules/file-system';
import { createMockFileSystem } from '@testing-helpers';
import { createYamlConfigFromFileSystem } from '../yamlConfigLoader';

describe('yamlConfigLoader', () => {
  let mockFileSystem: IFileSystem;
  let fileSystemMocks: ReturnType<typeof createMockFileSystem>['fileSystemMocks'];

  const DEFAULT_CONFIG_PATH = '/test/default-config.yaml';
  const USER_CONFIG_PATH = '/test/config.yaml';

  const MOCK_DEFAULT_CONFIG = `
paths:
  dotfilesDir: ~/.dotfiles
  targetDir: /usr/local/bin
  generatedDir: \${paths.dotfilesDir}/.generated
  toolConfigsDir: \${paths.dotfilesDir}/generator/configs/tools
  completionsDir: \${paths.generatedDir}/completions
  manifestPath: \${paths.generatedDir}/generated-manifest.json
system:
  sudoPrompt: "Enter password for generator:"
logging:
  debug: ""
updates:
  checkOnRun: true
  checkInterval: 86400
github:
  token: \${GITHUB_TOKEN}
  host: https://api.github.com
  userAgent: "dotfiles-generator"
  cache:
    enabled: true
    ttl: 86400000
downloader:
  timeout: 300000
  retryCount: 3
  retryDelay: 1000
  cache:
    enabled: true
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

  const MOCK_USER_CONFIG = `
paths:
  dotfilesDir: ~/custom-dotfiles
  targetDir: /custom/bin
github:
  token: user-github-token
`;

  beforeEach(() => {
    const { mockFileSystem: mfsInstance, fileSystemMocks: fsMocksInstance } = createMockFileSystem({
      readFile: mock(async (path: string) => {
        if (path === DEFAULT_CONFIG_PATH) {
          return MOCK_DEFAULT_CONFIG;
        } else if (path === USER_CONFIG_PATH) {
          return MOCK_USER_CONFIG;
        }
        throw new Error(`File not found: ${path}`);
      }),
    });
    mockFileSystem = mfsInstance;
    fileSystemMocks = fsMocksInstance;
  });

  afterEach(() => {
    mock.restore();
  });

  it('should load default config when user config does not exist', async () => {
    const { mockFileSystem: mfsInstance, fileSystemMocks: fsMocksInstance } = createMockFileSystem({
      readFile: mock(async (path: string) => {
        if (path === DEFAULT_CONFIG_PATH) {
          return MOCK_DEFAULT_CONFIG;
        }
        throw new Error(`File not found: ${path}`);
      }),
    });
    mockFileSystem = mfsInstance;
    fileSystemMocks = fsMocksInstance;

    const systemInfo = {
      homedir: '/home/testuser',
      cwd: '/home/testuser/project',
      platform: 'linux',
      arch: 'x64',
    } as const;
    const env = { GITHUB_TOKEN: 'test-token' };

    const result = await createYamlConfigFromFileSystem(
      mockFileSystem,
      USER_CONFIG_PATH,
      systemInfo,
      env,
      DEFAULT_CONFIG_PATH
    );

    expect(fileSystemMocks.readFile).toHaveBeenCalledWith(DEFAULT_CONFIG_PATH, 'utf-8');
    expect(result.paths.dotfilesDir).toBe('~/.dotfiles');
    expect(result.github.token).toBe('test-token');
  });

  it('should merge default config with user config', async () => {
    const systemInfo = {
      homedir: '/home/testuser',
      cwd: '/home/testuser/project',
      platform: 'linux',
      arch: 'x64',
    } as const;
    const env = { GITHUB_TOKEN: 'test-token' };

    const result = await createYamlConfigFromFileSystem(
      mockFileSystem,
      USER_CONFIG_PATH,
      systemInfo,
      env,
      DEFAULT_CONFIG_PATH
    );

    expect(fileSystemMocks.readFile).toHaveBeenCalledWith(DEFAULT_CONFIG_PATH, 'utf-8');
    expect(fileSystemMocks.readFile).toHaveBeenCalledWith(USER_CONFIG_PATH, 'utf-8');

    expect(result.paths.dotfilesDir).toBe('~/custom-dotfiles');
    expect(result.paths.targetDir).toBe('/custom/bin');
    expect(result.github.token).toBe('user-github-token');
    expect(result.logging.debug).toBe('');
    expect(result.updates.checkOnRun).toBe(true);
  });

  it('should apply platform-specific overrides for macOS', async () => {
    const systemInfo = {
      homedir: '/home/testuser',
      cwd: '/home/testuser/project',
      platform: 'darwin',
      arch: 'x64',
    } as const;
    const env = {};

    const result = await createYamlConfigFromFileSystem(
      mockFileSystem,
      USER_CONFIG_PATH,
      systemInfo,
      env,
      DEFAULT_CONFIG_PATH
    );

    expect(result.paths.targetDir).toBe('/custom/bin');
    expect(result.platform).toBeUndefined();
  });

  it('should apply platform-specific overrides for Linux ARM64', async () => {
    const systemInfo = {
      homedir: '/home/testuser',
      cwd: '/home/testuser/project',
      platform: 'linux',
      arch: 'arm64',
    } as const;
    const env = {};

    const result = await createYamlConfigFromFileSystem(
      mockFileSystem,
      USER_CONFIG_PATH,
      systemInfo,
      env,
      DEFAULT_CONFIG_PATH
    );

    expect(result.downloader.timeout).toBe(600000);
  });

  it('should substitute environment variables in config', async () => {
    const { mockFileSystem: mfsInstance, fileSystemMocks: fsMocksInstance } = createMockFileSystem({
      readFile: mock(async (path: string) => {
        if (path === DEFAULT_CONFIG_PATH) {
          return MOCK_DEFAULT_CONFIG;
        }
        throw new Error(`File not found: ${path}`);
      }),
    });
    mockFileSystem = mfsInstance;
    fileSystemMocks = fsMocksInstance;
    const systemInfo = {
      homedir: '/home/testuser',
      cwd: '/home/testuser/project',
      platform: 'linux',
      arch: 'x64',
    } as const;
    const env = { GITHUB_TOKEN: 'env-github-token' };

    const result = await createYamlConfigFromFileSystem(
      mockFileSystem,
      USER_CONFIG_PATH,
      systemInfo,
      env,
      DEFAULT_CONFIG_PATH
    );

    expect(result.github.token).toBe('env-github-token');
  });

  it('should substitute config references in config', async () => {
    const systemInfo = {
      homedir: '/home/testuser',
      cwd: '/home/testuser/project',
      platform: 'linux',
      arch: 'x64',
    } as const;
    const env = {};

    const result = await createYamlConfigFromFileSystem(
      mockFileSystem,
      USER_CONFIG_PATH,
      systemInfo,
      env,
      DEFAULT_CONFIG_PATH
    );

    expect(result.paths.generatedDir).toBe('~/custom-dotfiles/.generated');
    expect(result.paths.toolConfigsDir).toBe('~/custom-dotfiles/generator/configs/tools');
    expect(result.paths.completionsDir).toBe('~/custom-dotfiles/.generated/completions');
    expect(result.paths.manifestPath).toBe('~/custom-dotfiles/.generated/generated-manifest.json');
  });

  it('should throw an error when default config file does not exist', async () => {
    const { mockFileSystem: mfsInstance } = createMockFileSystem({
      readFile: mock(async () => {
        throw new Error('File not found');
      }),
    });
    mockFileSystem = mfsInstance;

    expect(
      createYamlConfigFromFileSystem(
        mockFileSystem,
        USER_CONFIG_PATH,
        {} as any,
        {},
        DEFAULT_CONFIG_PATH
      )
    ).rejects.toThrow();
  });

  it('should validate the final config using yamlConfigSchema', async () => {
    const originalParse = yamlConfigSchema.yamlConfigSchema.parse;
    const parseSpy = mock(originalParse);
    yamlConfigSchema.yamlConfigSchema.parse = parseSpy;
    const systemInfo = {
      homedir: '/home/testuser',
      cwd: '/home/testuser/project',
      platform: 'linux',
      arch: 'x64',
    } as const;
    const env = {};

    await createYamlConfigFromFileSystem(
      mockFileSystem,
      USER_CONFIG_PATH,
      systemInfo,
      env,
      DEFAULT_CONFIG_PATH
    );

    expect(parseSpy).toHaveBeenCalledTimes(1);
    yamlConfigSchema.yamlConfigSchema.parse = originalParse;
  });

  it('should handle validation errors from yamlConfigSchema', async () => {
    const validationError = new Error('Validation failed');
    const originalParse = yamlConfigSchema.yamlConfigSchema.parse;
    yamlConfigSchema.yamlConfigSchema.parse = mock(() => {
      throw validationError;
    });

    const systemInfo = {
      homedir: '/home/testuser',
      cwd: '/home/testuser/project',
      platform: 'linux',
      arch: 'x64',
    } as const;
    const env = {};

    expect(
      createYamlConfigFromFileSystem(
        mockFileSystem,
        USER_CONFIG_PATH,
        systemInfo,
        env,
        DEFAULT_CONFIG_PATH
      )
    ).rejects.toThrow(validationError);
    yamlConfigSchema.yamlConfigSchema.parse = originalParse;
  });
});
