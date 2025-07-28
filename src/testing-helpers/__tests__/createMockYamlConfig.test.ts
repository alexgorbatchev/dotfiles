import { createYamlConfigFromObject, } from '@modules/config-loader';
import { describe, expect, it } from 'bun:test';
import { stringify } from 'yaml';
import { createMemFileSystem } from '../createMemFileSystem';
import { createMockYamlConfig, type PartialYamlConfig } from '../createMockYamlConfig';

describe('createMockYamlConfig', () => {
  const mockConfig: PartialYamlConfig = {
    paths: {
      dotfilesDir: '/dotfiles',
      targetDir: '/target',
      generatedDir: '/generated',
      toolConfigsDir: '/tool-configs',
      completionsDir: '/completions',
      manifestPath: '/manifest.json',
    },
  };

  it('should write the YAML string to the specified path', async () => {
    const { fs } = await createMemFileSystem();
    const filePath = '/test.yaml';
    const systemInfo = { platform: 'darwin', arch: 'arm64', homeDir: '/home/test' };
    const env = {};
    await createMockYamlConfig({
      config: mockConfig,
      filePath,
      fileSystem: fs,
      systemInfo,
      env,
    });
    const fileContent = await fs.readFile(filePath, 'utf8');
    const expectedConfig = await createYamlConfigFromObject(fs, mockConfig, systemInfo, env);
    expect(fileContent).toBe(stringify(expectedConfig));
  });
});
