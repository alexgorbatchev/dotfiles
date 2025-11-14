import { describe, expect, it } from 'bun:test';
import { createYamlConfigFromObject } from '@dotfiles/config';
import type { SystemInfo } from '@dotfiles/core';
import { createMemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createMockYamlConfig, type PartialYamlConfig } from '../src/createMockYamlConfig';

describe('createMockYamlConfig', () => {
  const mockConfig: PartialYamlConfig = {
    paths: {
      dotfilesDir: '/dotfiles',
      targetDir: '/target',
      generatedDir: '/generated',
      toolConfigsDir: '/tool-configs',
      shellScriptsDir: '/shell-scripts',
    },
  };

  it('should write the YAML string to the specified path', async () => {
    const { fs } = await createMemFileSystem();
    const logger = new TestLogger();
    const filePath = '/test.yaml';
    const systemInfo: SystemInfo = { platform: 'darwin', arch: 'arm64', homeDir: '/home/test' };
    const env: Record<string, string | undefined> = {};
    await createMockYamlConfig({
      config: mockConfig,
      filePath,
      fileSystem: fs,
      logger,
      systemInfo,
      env,
    });
    const fileContent = await fs.readFile(filePath, 'utf8');
    const expectedConfig = await createYamlConfigFromObject(logger, fs, mockConfig, systemInfo, env, {
      userConfigPath: filePath,
    });
    expect(fileContent).toBe(Bun.YAML.stringify(expectedConfig));
  });
});
