import { describe, it, expect } from 'bun:test';
import { createMockYamlConfig, type PartialYamlConfig } from '../createMockYamlConfig';
import { createMemFileSystem } from '../createMemFileSystem';
import { createYamlConfigFromObject, getDefaultConfigPath } from '@modules/config-loader';
import { stringify } from 'yaml';
import { MOCK_DEFAULT_CONFIG } from '@modules/config-loader/__tests__/fixtures';

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
    const fs = createMemFileSystem({
      [getDefaultConfigPath()]: MOCK_DEFAULT_CONFIG,
    });
    const filePath = '/test.yaml';
    const systemInfo = { platform: 'darwin', arch: 'arm64' };
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
