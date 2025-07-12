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
    const { fs: fileSystem } = await createMemFileSystem({
      initialVolumeJson: {
        [getDefaultConfigPath()]: MOCK_DEFAULT_CONFIG,
      },
    });

    const result = (await loadDefaultYamlConfigAsRecord(fileSystem)) as any;

    expect(result.paths?.toolConfigsDir).toBe('${paths.dotfilesDir}/generator/configs/tools');
    expect(result.github?.token).toBe('${GITHUB_TOKEN}');
  });

  it('should merge default config with user config', async () => {
    const { fs: fileSystem } = await createMemFileSystem({
      initialVolumeJson: {
        [getDefaultConfigPath()]: MOCK_DEFAULT_CONFIG,
        [USER_CONFIG_PATH]: MOCK_USER_CONFIG,
      },
    });

    const result = await createYamlConfigFromFileSystem(
      fileSystem,
      USER_CONFIG_PATH,
      {
        homeDir: '/home/testuser',
        platform: 'linux',
        arch: 'x64',
      },
      { GITHUB_TOKEN: 'test-token' }
    );

    expect(result.paths.dotfilesDir).toBe('/home/testuser/custom-dotfiles');
    expect(result.paths.targetDir).toBe('/custom/bin');
    expect(result.github.token).toBe('user-github-token');
    expect(result.logging.debug).toBe('');
    expect(result.updates.checkOnRun).toBe(true);
  });

  it('should apply platform-specific overrides from user config', async () => {
    const { fs: fileSystem } = await createMemFileSystem({
      initialVolumeJson: {
        [getDefaultConfigPath()]: MOCK_DEFAULT_CONFIG,
        [USER_CONFIG_PATH]: MOCK_USER_CONFIG_WITH_PLATFORM,
      },
    });

    // Test for macOS
    const macResult = await createYamlConfigFromFileSystem(
      fileSystem,
      USER_CONFIG_PATH,
      {
        homeDir: '/home/testuser',
        platform: 'darwin',
        arch: 'x64',
      },
      {}
    );
    expect(macResult.paths.targetDir).toBe('/opt/homebrew/bin');
    expect(macResult.platform).toBeUndefined();

    const linuxResult = await createYamlConfigFromFileSystem(
      fileSystem,
      USER_CONFIG_PATH,
      {
        homeDir: '/home/testuser',
        platform: 'linux',
        arch: 'arm64',
      },
      {}
    );
    expect(linuxResult.downloader.timeout).toBe(600000);
  });

  it('should not apply platform overrides if none are defined', async () => {
    const { fs: fileSystem } = await createMemFileSystem({
      initialVolumeJson: {
        [getDefaultConfigPath()]: MOCK_DEFAULT_CONFIG,
        [USER_CONFIG_PATH]: MOCK_USER_CONFIG,
      },
    });

    const result = await createYamlConfigFromFileSystem(
      fileSystem,
      USER_CONFIG_PATH,
      {
        homeDir: '/home/testuser',
        platform: 'darwin',
        arch: 'x64',
      },
      { GITHUB_TOKEN: 'test-token' }
    );

    // It should use the value from the merged user/default config, not an override
    expect(result.paths.targetDir).toBe('/custom/bin');
    expect(result.platform).toBeUndefined();
  });

  it('should substitute environment variables in config', async () => {
    const { fs: fileSystem } = await createMemFileSystem({
      initialVolumeJson: {
        [getDefaultConfigPath()]: MOCK_DEFAULT_CONFIG,
      },
    });

    const result = await createYamlConfigFromFileSystem(
      fileSystem,
      USER_CONFIG_PATH, // non-existent
      {
        homeDir: '/home/testuser',
        platform: 'linux',
        arch: 'x64',
      },
      { GITHUB_TOKEN: 'env-github-token' }
    );

    expect(result.github.token).toBe('env-github-token');
  });

  it('should substitute config references in config', async () => {
    const { fs: fileSystem } = await createMemFileSystem({
      initialVolumeJson: {
        [getDefaultConfigPath()]: MOCK_DEFAULT_CONFIG,
        [USER_CONFIG_PATH]: MOCK_USER_CONFIG,
      },
    });

    const result = await createYamlConfigFromFileSystem(
      fileSystem,
      USER_CONFIG_PATH,
      {
        homeDir: '/home/testuser',
        platform: 'linux',
        arch: 'x64',
      },
      {}
    );

    expect(result.paths.generatedDir).toBe('/home/testuser/custom-dotfiles/.generated');
    expect(result.paths.toolConfigsDir).toBe(
      '/home/testuser/custom-dotfiles/generator/configs/tools'
    );
    expect(result.paths.completionsDir).toBe(
      '/home/testuser/custom-dotfiles/.generated/completions'
    );
    expect(result.paths.manifestPath).toBe(
      '/home/testuser/custom-dotfiles/.generated/generated-manifest.json'
    );
  });

  it('should throw an error when default config file does not exist', async () => {
    const { fs: fileSystem } = await createMemFileSystem({});

    expect(
      createYamlConfigFromFileSystem(fileSystem, USER_CONFIG_PATH, {} as any, {})
    ).rejects.toThrow();
  });

  it('should handle validation errors from yamlConfigSchema', async () => {
    const MOCK_INVALID_USER_CONFIG = `
github:
  token: 12345
`;
    const { fs: fileSystem } = await createMemFileSystem({
      initialVolumeJson: {
        [getDefaultConfigPath()]: MOCK_DEFAULT_CONFIG,
        [USER_CONFIG_PATH]: MOCK_INVALID_USER_CONFIG,
      },
    });

    expect(
      createYamlConfigFromFileSystem(
        fileSystem,
        USER_CONFIG_PATH,
        {
          homeDir: '/home/testuser',
          platform: 'linux',
          arch: 'x64',
        },
        {}
      )
    ).rejects.toThrow(/YAML configuration is invalid/);
  });
});
