import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import type { ISystemInfo } from '@dotfiles/core';
import { createMemFileSystem, NodeFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createTestDirectories } from '@dotfiles/testing-helpers';
import { loadTsConfig } from '../tsConfigLoader';

describe('tsConfigLoader', () => {
  const mockSystemInfo: ISystemInfo = {
    platform: 'darwin',
    arch: 'arm64',
    homeDir: '/Users/testuser',
  };

  let logger: TestLogger;
  let tempDir: string;
  let cleanupFn: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    logger = new TestLogger();
    const realFs = new NodeFileSystem();
    const testDirs = await createTestDirectories(logger, realFs, {
      testName: 'tsConfigLoader',
    });
    tempDir = testDirs.paths.homeDir;
    cleanupFn = async () => {
      await realFs.rm(testDirs.paths.homeDir, { recursive: true, force: true });
    };
  });

  afterEach(async () => {
    if (cleanupFn) {
      await cleanupFn();
    }
  });

  describe('function export patterns', () => {
    it('should load config from defineConfig', async () => {
      const configPath = path.join(tempDir, 'config.ts');
      const configContent = `
        export default {
          paths: {
            dotfilesDir: '~/.custom-dotfiles',
            targetDir: '/custom/bin',
          },
          github: {
            token: 'test-token',
          },
        };
      `;

      await Bun.write(configPath, configContent);

      const { fs } = await createMemFileSystem();
      const result = await loadTsConfig(logger, fs, configPath, mockSystemInfo, {});

      const expectedDotfilesDir = path.join(path.dirname(configPath), '.custom-dotfiles');
      expect(result.paths.dotfilesDir).toBe(expectedDotfilesDir);
      expect(result.paths.targetDir).toBe('/custom/bin');
      expect(result.github.token).toBe('test-token');
    });

    it('should load config from direct object export', async () => {
      const configPath = path.join(tempDir, 'object-config.ts');
      const configContent = `
        export default {
          paths: {
            dotfilesDir: '~/object-dotfiles',
            targetDir: '/obj/bin',
          },
        };
      `;

      await Bun.write(configPath, configContent);

      const { fs } = await createMemFileSystem();
      const result = await loadTsConfig(logger, fs, configPath, mockSystemInfo, {});

      const expectedDotfilesDir = path.join(path.dirname(configPath), 'object-dotfiles');
      expect(result.paths.dotfilesDir).toBe(expectedDotfilesDir);
      expect(result.paths.targetDir).toBe('/obj/bin');
    });
  });

  describe('configuration merging', () => {
    it('should merge partial config with defaults', async () => {
      const configPath = path.join(tempDir, 'partial-config.ts');
      const configContent = `
        export default {
          paths: {
            targetDir: '/custom/bin',
          },
        };
      `;

      await Bun.write(configPath, configContent);

      const { fs } = await createMemFileSystem();
      const result = await loadTsConfig(logger, fs, configPath, mockSystemInfo, {});

      // Custom value
      expect(result.paths.targetDir).toBe('/custom/bin');

      // Default values should still be present
      expect(result.paths.binariesDir).toBeDefined();
      expect(result.paths.shellScriptsDir).toBeDefined();
      expect(result.github.host).toBe('https://api.github.com');
      expect(result.updates.checkOnRun).toBe(true);
    });

    it('should deeply merge nested configuration objects', async () => {
      const configPath = path.join(tempDir, 'nested-config.ts');
      const configContent = `
        export default {
          github: {
            token: 'custom-token',
          },
          downloader: {
            timeout: 600000,
          },
        };
      `;

      await Bun.write(configPath, configContent);

      const { fs } = await createMemFileSystem();
      const result = await loadTsConfig(logger, fs, configPath, mockSystemInfo, {});

      // Custom values
      expect(result.github.token).toBe('custom-token');
      expect(result.downloader.timeout).toBe(600000);

      // Default nested values should still be present
      expect(result.github.host).toBe('https://api.github.com');
      expect(result.github.userAgent).toBe('dotfiles-generator');
      expect(result.downloader.retryCount).toBe(3);
    });
  });

  describe('dynamic values', () => {
    it('should support dynamic values in config function', async () => {
      const configPath = path.join(tempDir, 'dynamic-config.ts');
      const testToken = 'dynamic-token';
      const configContent = `
        export default {
          github: {
            token: '${testToken}',
          },
        };
      `;

      await Bun.write(configPath, configContent);

      const { fs } = await createMemFileSystem();
      const result = await loadTsConfig(logger, fs, configPath, mockSystemInfo, {});

      expect(result.github.token).toBe('dynamic-token');
    });
  });

  describe('config file context', () => {
    it('should resolve configFileDir tokens using the actual config location', async () => {
      const configPath = path.join(tempDir, 'dir-token-config.ts');
      const configContent = `
        export default {
          paths: {
            generatedDir: '\${configFileDir}/.generated',
            toolConfigsDir: '\${configFileDir}/tools',
          },
        };
      `;

      await Bun.write(configPath, configContent);

      const { fs } = await createMemFileSystem();
      const result = await loadTsConfig(logger, fs, configPath, mockSystemInfo, {});

      const expectedConfigDir = path.dirname(configPath);
      expect(result.configFilePath).toBe(configPath);
      expect(result.configFileDir).toBe(expectedConfigDir);
      expect(result.paths.generatedDir).toBe(path.join(expectedConfigDir, '.generated'));
      expect(result.paths.toolConfigsDir).toBe(path.join(expectedConfigDir, 'tools'));
    });
  });

  describe('error handling', () => {
    it('should exit with error if config file does not exist', async () => {
      const { fs } = await createMemFileSystem();

      expect(loadTsConfig(logger, fs, '/nonexistent/config.ts', mockSystemInfo, {})).rejects.toThrow(
        /MOCK_EXIT_CLI_CALLED_WITH_1/
      );
    });

    it('should exit with error if no default export', async () => {
      const configPath = path.join(tempDir, 'no-default.ts');
      const configContent = `
        export const config = { paths: {} };
      `;

      await Bun.write(configPath, configContent);

      const { fs } = await createMemFileSystem();

      expect(loadTsConfig(logger, fs, configPath, mockSystemInfo, {})).rejects.toThrow(/MOCK_EXIT_CLI_CALLED_WITH_1/);
    });

    it('should exit with error if default export is invalid type', async () => {
      const configPath = path.join(tempDir, 'invalid-type.ts');
      const configContent = `
        export default 'invalid';
      `;

      await Bun.write(configPath, configContent);

      const { fs } = await createMemFileSystem();

      expect(loadTsConfig(logger, fs, configPath, mockSystemInfo, {})).rejects.toThrow(/MOCK_EXIT_CLI_CALLED_WITH_1/);
    });

    it('should handle syntax errors in config file', async () => {
      const configPath = path.join(tempDir, 'syntax-error.ts');
      const configContent = `
        export default () => {
          return { invalid syntax
        };
      `;

      await Bun.write(configPath, configContent);

      const { fs } = await createMemFileSystem();

      expect(loadTsConfig(logger, fs, configPath, mockSystemInfo, {})).rejects.toThrow();
    });
  });

  describe('validation', () => {
    it('should validate configuration against schema', async () => {
      const configPath = path.join(tempDir, 'valid-config.ts');
      const configContent = `
        export default {
          paths: {
            dotfilesDir: '~/.dotfiles',
            targetDir: '/usr/local/bin',
          },
        };
      `;

      await Bun.write(configPath, configContent);

      const { fs } = await createMemFileSystem();
      const result = await loadTsConfig(logger, fs, configPath, mockSystemInfo, {});

      expect(result.configFilePath).toBeDefined();
      expect(result.configFileDir).toBeDefined();
    });
  });
});
