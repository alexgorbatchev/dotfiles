import { Architecture, type ISystemInfo, Platform } from '@dotfiles/core';
import { NodeFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createTestDirectories } from '@dotfiles/testing-helpers';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import { loadTsConfig } from '../tsConfigLoader';

describe('tsConfigLoader context', () => {
  const mockSystemInfo: ISystemInfo = {
    platform: Platform.MacOS,
    arch: Architecture.Arm64,
    homeDir: '/Users/testuser',
    hostname: 'test-host',
  };

  let logger: TestLogger;
  let tempDir: string;
  let cleanupFn: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    logger = new TestLogger();
    const realFs = new NodeFileSystem();
    const testDirs = await createTestDirectories(logger, realFs, {
      testName: 'tsConfigLoader-context',
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

  it('should pass context to config function', async () => {
    const configPath = path.join(tempDir, 'context-config.ts');
    // We use a raw function export here to simulate what defineConfig will return
    const configContent = `
      export default (ctx) => ({
        paths: {
          generatedDir: ctx.configFileDir + '/.generated',
        },
      });
    `;

    await Bun.write(configPath, configContent);

    const fs = new NodeFileSystem();
    const result = await loadTsConfig(logger, fs, configPath, mockSystemInfo, {});

    const expectedGeneratedDir = path.join(path.dirname(configPath), '.generated');
    expect(result.paths.generatedDir).toBe(expectedGeneratedDir);
  });
});
