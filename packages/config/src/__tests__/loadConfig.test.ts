import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import type { SystemInfo } from '@dotfiles/core';
import { createMemFileSystem, NodeFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createTestDirectories } from '@dotfiles/testing-helpers';
import { loadConfig } from '../loadConfig';

describe('loadConfig', () => {
  const mockSystemInfo: SystemInfo = {
    platform: 'darwin',
    arch: 'arm64',
    homeDir: '/Users/testuser',
  };

  let logger: TestLogger;
  let tempDir: string | undefined;
  let cleanupFn: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    logger = new TestLogger();
  });

  afterEach(async () => {
    if (cleanupFn) {
      await cleanupFn();
      cleanupFn = undefined;
      tempDir = undefined;
    }
  });

  describe('file type detection', () => {
    it('should load YAML config when file has .yaml extension', async () => {
      const yamlContent = `
        paths:
          dotfilesDir: ~/yaml-dotfiles
          targetDir: /yaml/bin
      `;

      const { fs } = await createMemFileSystem({
        initialVolumeJson: {
          '/test/config.yaml': yamlContent,
        },
      });

      const result = await loadConfig(logger, fs, '/test/config.yaml', mockSystemInfo, {});

      expect(result.paths.dotfilesDir).toBe('/test/yaml-dotfiles');
      expect(result.paths.targetDir).toBe('/yaml/bin');
    });

    it('should load YAML config when file has .yml extension', async () => {
      const yamlContent = `
        paths:
          dotfilesDir: ~/yml-dotfiles
      `;

      const { fs } = await createMemFileSystem({
        initialVolumeJson: {
          '/test/config.yml': yamlContent,
        },
      });

      const result = await loadConfig(logger, fs, '/test/config.yml', mockSystemInfo, {});

      expect(result.paths.dotfilesDir).toBe('/test/yml-dotfiles');
    });

    it('should load TypeScript config when file has .ts extension', async () => {
      const realFs = new NodeFileSystem();
      const testDirs = await createTestDirectories(logger, realFs, {
        testName: 'loadConfig-ts',
      });
      tempDir = testDirs.paths.homeDir;
      cleanupFn = async () => {
        if (tempDir) {
          await realFs.rm(tempDir, { recursive: true, force: true });
        }
      };

      if (!tempDir) {
        throw new Error('tempDir is not defined');
      }

      const configPath = path.join(tempDir, 'config.ts');
      const tsContent = `
        export default {
          paths: {
            dotfilesDir: '~/ts-dotfiles',
            targetDir: '/ts/bin',
          },
        };
      `;

      await realFs.writeFile(configPath, tsContent);
      const { fs } = await createMemFileSystem();

      const result = await loadConfig(logger, fs, configPath, mockSystemInfo, {});

      const expectedConfigDir = path.dirname(configPath);
      expect(result.paths.dotfilesDir).toBe(path.join(expectedConfigDir, 'ts-dotfiles'));
      expect(result.paths.targetDir).toBe('/ts/bin');
    });
    it('should throw error for unsupported file extensions', async () => {
      const { fs } = await createMemFileSystem({
        initialVolumeJson: {
          '/test/config.json': '{}',
        },
      });

      expect(loadConfig(logger, fs, '/test/config.json', mockSystemInfo, {})).rejects.toThrow(
        'Unsupported configuration file type'
      );
    });
  });

  describe('logging', () => {
    it('should log when loading TypeScript config', async () => {
      const realFs = new NodeFileSystem();
      const testDirs = await createTestDirectories(logger, realFs, {
        testName: 'loadConfig-logging',
      });
      tempDir = testDirs.paths.homeDir;
      cleanupFn = async () => {
        if (tempDir) {
          await realFs.rm(tempDir, { recursive: true, force: true });
        }
      };

      if (!tempDir) {
        throw new Error('tempDir is not defined');
      }

      const configPath = path.join(tempDir, 'config.ts');
      await realFs.writeFile(configPath, `export default {};`);

      const { fs } = await createMemFileSystem();
      await loadConfig(logger, fs, configPath, mockSystemInfo, {});

      expect(logger.logs.length).toBeGreaterThan(0);
    });
    it('should log when loading YAML config', async () => {
      const yamlContent = 'paths: {}';

      const { fs } = await createMemFileSystem({
        initialVolumeJson: {
          '/test/config.yaml': yamlContent,
        },
      });

      await loadConfig(logger, fs, '/test/config.yaml', mockSystemInfo, {});

      expect(logger.logs.length).toBeGreaterThan(0);
    });
  });
});
