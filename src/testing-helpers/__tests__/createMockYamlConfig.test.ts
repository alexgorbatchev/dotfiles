import { describe, expect, it } from 'bun:test';
import { createYamlConfigFromObject } from '@modules/config-loader';
import { stringify } from 'yaml';
import { createMemFileSystem } from '../createMemFileSystem';
import { createMockYamlConfig, type PartialYamlConfig } from '../createMockYamlConfig';
import { TestLogger } from '../TestLogger';

describe('createMockYamlConfig', () => {
  const mockConfig: PartialYamlConfig = {
    paths: {
      dotfilesDir: '/dotfiles',
      targetDir: '/target',
      generatedDir: '/generated',
      toolConfigsDir: '/tool-configs',
      shellScriptsDir: '/shell-scripts',
      manifestPath: '/manifest.json',
    },
  };

  it('should write the YAML string to the specified path', async () => {
    const { fs } = await createMemFileSystem();
    const logger = new TestLogger();
    const filePath = '/test.yaml';
    const systemInfo = { platform: 'darwin', arch: 'arm64', homeDir: '/home/test' };
    const env = {};
    await createMockYamlConfig({
      config: mockConfig,
      filePath,
      fileSystem: fs,
      logger,
      systemInfo,
      env,
    });
    const fileContent = await fs.readFile(filePath, 'utf8');
    const expectedConfig = await createYamlConfigFromObject(logger, fs, mockConfig, systemInfo, env);
    expect(fileContent).toBe(stringify(expectedConfig));
  });
});
