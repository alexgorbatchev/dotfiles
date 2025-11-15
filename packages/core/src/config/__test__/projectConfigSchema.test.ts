import { describe, expect, test } from 'bun:test';
import type { ProjectConfig } from '../projectConfigSchema';

describe('projectConfigSchemaTest', () => {
  test('type validation', () => {
    const config: ProjectConfig = {
      configFilePath: '',
      configFileDir: '',

      paths: {
        homeDir: '',
        dotfilesDir: 'test',
        targetDir: '',
        generatedDir: '',
        toolConfigsDir: '',
        shellScriptsDir: '',
        binariesDir: '',
      },
      system: {
        sudoPrompt: '',
      },
      logging: {
        debug: '',
      },
      updates: {
        checkOnRun: false,
        checkInterval: 0,
      },
      github: {
        host: '',
        token: '',
        userAgent: '',
        cache: { enabled: false, ttl: 0 },
      },
      cargo: {
        cratesIo: {
          host: '',
          cache: { enabled: false, ttl: 0 },
          token: '',
          userAgent: '',
        },
        githubRaw: {
          host: '',
          cache: { enabled: false, ttl: 0 },
          token: '',
          userAgent: '',
        },
        githubRelease: {
          host: '',
          cache: { enabled: false, ttl: 0 },
          token: '',
          userAgent: '',
        },
        userAgent: '',
      },
      downloader: {
        timeout: 0,
        retryCount: 0,
        retryDelay: 0,
        cache: {
          enabled: false,
          ttl: 0,
        },
      },
      features: {
        catalog: {
          generate: true,
          filePath: `\${paths.dotfilesDir}`,
        },
      },
      platform: [
        {
          match: [{ os: 'macos' }, { arch: 'arm64' }],
          config: {
            paths: {
              dotfilesDir: 'macos-arm64-dotfiles',
            },
          },
        },
      ],
    };

    expect(config).not.toBeUndefined();
  });
});
