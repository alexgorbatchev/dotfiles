import { Architecture, type ISystemInfo, Platform } from '@dotfiles/core';
import { NodeFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createTestDirectories } from '@dotfiles/testing-helpers';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import { loadConfig } from '../loadConfig';

describe('loadConfig - TypeScript path substitution', () => {
  const mockSystemInfo: ISystemInfo = {
    platform: Platform.MacOS,
    arch: Architecture.Arm64,
    homeDir: '/Users/testuser',
    hostname: 'test-host',
  };

  let logger: TestLogger;
  let tempDir: string | undefined;
  let cleanupFn: (() => Promise<void>) | undefined;
  let realFs: NodeFileSystem;

  beforeEach(async () => {
    logger = new TestLogger();
    realFs = new NodeFileSystem();
  });

  afterEach(async () => {
    if (cleanupFn) {
      await cleanupFn();
      cleanupFn = undefined;
      tempDir = undefined;
    }
  });

  it('should resolve targetDir path variable referencing paths.generatedDir', async () => {
    const testDirs = await createTestDirectories(logger, realFs, {
      testName: 'loadConfig-targetDir-path-var',
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
          generatedDir: '{configFileDir}/.generated',
          homeDir: '{paths.generatedDir}/user-home',
          targetDir: '{paths.generatedDir}/user-bin',
          toolConfigsDir: '{configFileDir}/tools',
        },
      };
    `;

    await realFs.writeFile(configPath, tsContent);
    const result = await loadConfig(logger, realFs, configPath, mockSystemInfo, {});

    const expectedConfigDir = path.dirname(configPath);
    const expectedGeneratedDir = path.join(expectedConfigDir, '.generated');
    const expectedTargetDir = path.join(expectedGeneratedDir, 'user-bin');

    expect(result.paths.generatedDir).toBe(expectedGeneratedDir);
    expect(result.paths.targetDir).toBe(expectedTargetDir);
    expect(result.paths.homeDir).toBe(path.join(expectedGeneratedDir, 'user-home'));
    expect(result.paths.toolConfigsDir).toBe(path.join(expectedConfigDir, 'tools'));
  });

  it('should resolve nested path variable references in correct order', async () => {
    const testDirs = await createTestDirectories(logger, realFs, {
      testName: 'loadConfig-nested-path-vars',
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
          dotfilesDir: '{configFileDir}/dotfiles',
          generatedDir: '{paths.dotfilesDir}/.generated',
          targetDir: '{paths.generatedDir}/bin',
          shellScriptsDir: '{paths.generatedDir}/shell-scripts',
        },
      };
    `;

    await realFs.writeFile(configPath, tsContent);
    const result = await loadConfig(logger, realFs, configPath, mockSystemInfo, {});

    const expectedConfigDir = path.dirname(configPath);
    const expectedDotfilesDir = path.join(expectedConfigDir, 'dotfiles');
    const expectedGeneratedDir = path.join(expectedDotfilesDir, '.generated');

    expect(result.paths.dotfilesDir).toBe(expectedDotfilesDir);
    expect(result.paths.generatedDir).toBe(expectedGeneratedDir);
    expect(result.paths.targetDir).toBe(path.join(expectedGeneratedDir, 'bin'));
    expect(result.paths.shellScriptsDir).toBe(path.join(expectedGeneratedDir, 'shell-scripts'));
  });

  it('should handle defineConfig wrapper with path variable substitution', async () => {
    const testDirs = await createTestDirectories(logger, realFs, {
      testName: 'loadConfig-defineConfig-wrapper',
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
    // This mimics test-project/config.ts structure
    const tsContent = `
      import { defineConfig } from '@dotfiles/config';
      
      export default defineConfig(() => ({
        paths: {
          generatedDir: '{configFileDir}/.generated',
          homeDir: '{paths.generatedDir}/user-home',
          targetDir: '{paths.generatedDir}/user-bin',
          toolConfigsDir: '{configFileDir}/tools',
        },
      }));
    `;

    await realFs.writeFile(configPath, tsContent);
    const result = await loadConfig(logger, realFs, configPath, mockSystemInfo, {});

    const expectedConfigDir = path.dirname(configPath);
    const expectedGeneratedDir = path.join(expectedConfigDir, '.generated');
    const expectedTargetDir = path.join(expectedGeneratedDir, 'user-bin');

    expect(result.paths.generatedDir).toBe(expectedGeneratedDir);
    expect(result.paths.targetDir).toBe(expectedTargetDir);
    expect(result.paths.homeDir).toBe(path.join(expectedGeneratedDir, 'user-home'));
    expect(result.paths.toolConfigsDir).toBe(path.join(expectedConfigDir, 'tools'));
  });
});
