import { Architecture, type ISystemInfo, Platform } from '@dotfiles/core';
import { createMemFileSystem, NodeFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createTestDirectories } from '@dotfiles/testing-helpers';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import { loadConfig } from '../loadConfig';

describe('loadConfig', () => {
  const mockSystemInfo: ISystemInfo = {
    platform: Platform.MacOS,
    arch: Architecture.Arm64,
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
      const fs = new NodeFileSystem();

      const result = await loadConfig(logger, fs, configPath, mockSystemInfo, {});

      expect(result.paths.dotfilesDir).toBe('/Users/testuser/ts-dotfiles');
      expect(result.paths.targetDir).toBe('/ts/bin');
    });

    it('should throw error for unsupported file extensions', async () => {
      const { fs } = await createMemFileSystem({
        initialVolumeJson: {
          '/test/config.json': '{}',
        },
      });

      expect(loadConfig(logger, fs, '/test/config.json', mockSystemInfo, {})).rejects.toThrow(
        'Unsupported configuration file type',
      );
    });

    it('should throw error for YAML files (no longer supported)', async () => {
      const { fs } = await createMemFileSystem({
        initialVolumeJson: {
          '/test/config.yaml': 'paths: {}',
        },
      });

      expect(loadConfig(logger, fs, '/test/config.yaml', mockSystemInfo, {})).rejects.toThrow(
        'Unsupported configuration file type',
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

      const fs = new NodeFileSystem();
      await loadConfig(logger, fs, configPath, mockSystemInfo, {});

      expect(logger.logs.length).toBeGreaterThan(0);
    });
  });
});
