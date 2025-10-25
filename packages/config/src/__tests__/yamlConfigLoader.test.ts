import { beforeEach, describe, expect, it } from 'bun:test';
import type { IFileSystem } from '@dotfiles/file-system';
import { createMemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import type { SystemInfo } from '@dotfiles/schemas';
import { loadYamlConfig } from '../yamlConfigLoader';

describe('yamlConfigLoader', () => {
  const USER_CONFIG_PATH = '/test/config.yaml';

  const mockSystemInfo: SystemInfo = {
    platform: 'darwin',
    arch: 'arm64',
    homeDir: '/Users/testuser',
  };

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

  let logger: TestLogger;

  beforeEach(async () => {
    logger = new TestLogger();
  });

  describe('valid config', () => {
    let fileSystem: IFileSystem;

    beforeEach(async () => {
      const memFs = await createMemFileSystem({
        initialVolumeJson: {
          [USER_CONFIG_PATH]: MOCK_USER_CONFIG,
        },
      });
      fileSystem = memFs.fs;
    });

    it('should merge default config with user config', async () => {
      const result = await loadYamlConfig(
        logger,
        fileSystem,
        USER_CONFIG_PATH,
        {
          homeDir: '/home/testuser',
          platform: 'linux',
          arch: 'x64',
        },
        { GITHUB_TOKEN: 'test-token' }
      );

      expect(result.paths.dotfilesDir).toBe('/test/custom-dotfiles');
      expect(result.paths.targetDir).toBe('/custom/bin');
      expect(result.github.token).toBe('user-github-token');
      expect(result.logging.debug).toBe('');
      expect(result.updates.checkOnRun).toBe(true);
    });

    it('should apply platform-specific overrides from user config', async () => {
      const { fs } = await createMemFileSystem({
        initialVolumeJson: {
          [USER_CONFIG_PATH]: MOCK_USER_CONFIG_WITH_PLATFORM,
        },
      });

      // Test for macOS
      const macResult = await loadYamlConfig(
        logger,
        fs,
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

      const linuxResult = await loadYamlConfig(
        logger,
        fs,
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
      const result = await loadYamlConfig(
        logger,
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

    it('should substitute config variables in config', async () => {
      const { fs } = await createMemFileSystem({
        initialVolumeJson: {
          [USER_CONFIG_PATH]: `
            paths:
              generatedDir: \${configFileDir}/generatedDir 
              targetDir: \${paths.generatedDir}/targetDir 
          `,
        },
      });

      const result = await loadYamlConfig(
        logger,
        fs,
        USER_CONFIG_PATH,
        {
          homeDir: '/home/testuser',
          platform: 'linux',
          arch: 'x64',
        },
        { GITHUB_TOKEN: 'env-github-token' }
      );

      expect(result.paths.generatedDir).toBe('/test/generatedDir');
      expect(result.paths.targetDir).toBe('/test/generatedDir/targetDir');
    });

    it('should substitute environment variables in config', async () => {
      const { fs } = await createMemFileSystem({
        initialVolumeJson: {
          [USER_CONFIG_PATH]: `
            github:
              token: \${GITHUB_TOKEN}
          `,
        },
      });

      const result = await loadYamlConfig(
        logger,
        fs,
        USER_CONFIG_PATH,
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
      const result = await loadYamlConfig(
        logger,
        fileSystem,
        USER_CONFIG_PATH,
        {
          homeDir: '/home/testuser',
          platform: 'linux',
          arch: 'x64',
        },
        {}
      );

      expect(result.paths.generatedDir).toBe('/test/custom-dotfiles/.generated');
      expect(result.paths.toolConfigsDir).toBe('/test/custom-dotfiles/tools');
      expect(result.paths.shellScriptsDir).toBe('/test/custom-dotfiles/.generated/shell-scripts');
    });
  });

  it('exists if user config file does not exist', async () => {
    const { fs } = await createMemFileSystem();
    expect(loadYamlConfig(logger, fs, USER_CONFIG_PATH, mockSystemInfo, {})).rejects.toThrow(
      /MOCK_EXIT_CLI_CALLED_WITH_1/
    );
  });

  it('should throw an error when default config file does not exist', async () => {
    const { fs } = await createMemFileSystem({});
    expect(loadYamlConfig(logger, fs, USER_CONFIG_PATH, mockSystemInfo, {})).rejects.toThrow();
  });

  it('should handle validation errors from yamlConfigSchema', async () => {
    const { fs } = await createMemFileSystem({
      initialVolumeJson: {
        [USER_CONFIG_PATH]: `
          github:
            token: 12345
        `,
      },
    });

    expect(
      loadYamlConfig(
        logger,
        fs,
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
