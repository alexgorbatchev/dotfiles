import { createProjectConfigFromObject } from '@dotfiles/config';
import type { ISystemInfo } from '@dotfiles/core';
import { Architecture, Platform } from '@dotfiles/core';
import { createMemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { describe, expect, it } from 'bun:test';
import { createMockProjectConfig, type PartialProjectConfig } from '../src/createMockProjectConfig';

describe('createMockProjectConfig', () => {
  const mockConfig: PartialProjectConfig = {
    paths: {
      dotfilesDir: '/dotfiles',
      targetDir: '/target',
      generatedDir: '/generated',
      toolConfigsDir: '/tool-configs',
      shellScriptsDir: '/shell-scripts',
    },
  };

  it('should return the full ProjectConfig', async () => {
    const { fs } = await createMemFileSystem();
    const logger = new TestLogger();
    const filePath = '/test/config.ts';
    const systemInfo: ISystemInfo = {
      platform: Platform.MacOS,
      arch: Architecture.Arm64,
      homeDir: '/home/test',
      hostname: 'test-host',
    };
    const env: Record<string, string | undefined> = {};
    const result = await createMockProjectConfig({
      config: mockConfig,
      filePath,
      fileSystem: fs,
      logger,
      systemInfo,
      env,
    });
    const expectedConfig = await createProjectConfigFromObject(logger, fs, mockConfig, systemInfo, env, {
      userConfigPath: filePath,
    });
    expect(result).toEqual(expectedConfig);
  });
});
