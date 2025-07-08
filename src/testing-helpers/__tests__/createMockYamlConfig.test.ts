/**
 * @file generator/src/testing-helpers/__tests__/createMockYamlConfig.test.ts
 * @description Tests for the `createMockYamlConfig` testing helper.
 */

import { describe, it, expect } from 'bun:test';
import { createMockYamlConfig } from '../createMockYamlConfig';
import { createMemFileSystem } from '../createMemFileSystem';
import type { YamlConfig } from '../../modules/config/config.yaml.schema';
import { stringify } from 'yaml';

describe('createMockYamlConfig', () => {
  const mockConfig: YamlConfig = {
    paths: {
      dotfilesDir: '/dotfiles',
      targetDir: '/target',
      generatedDir: '/generated',
      toolConfigsDir: '/tool-configs',
      completionsDir: '/completions',
      manifestPath: '/manifest.json',
    },
    system: {
      sudoPrompt: 'sudo',
    },
    logging: {
      debug: 'false',
    },
    updates: {
      checkOnRun: false,
      checkInterval: 0,
    },
    github: {
      token: 'token',
      host: 'host',
      userAgent: 'userAgent',
      cache: {
        enabled: false,
        ttl: 0,
      },
    },
    downloader: {
      timeout: 0,
      retryCount: 0,
      retryDelay: 0,
      cache: {
        enabled: false,
      },
    },
  };

  it('should write the YAML string to the specified path', async () => {
    const fs = createMemFileSystem();
    const filePath = '/test.yaml';
    await createMockYamlConfig({ config: mockConfig, filePath, fileSystem: fs });
    const fileContent = await fs.readFile(filePath, 'utf8');
    expect(fileContent).toBe(stringify(mockConfig));
  });
});