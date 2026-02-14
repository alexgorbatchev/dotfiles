import type { IInstallContext } from '@dotfiles/core';
import { createShell } from '@dotfiles/core';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor } from '@dotfiles/installer';
import type { CurlBinaryToolConfig } from '@dotfiles/installer-curl-binary';
import { TestLogger } from '@dotfiles/logger';
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import assert from 'node:assert';
import { CurlBinaryInstallerPlugin } from '../CurlBinaryInstallerPlugin';

const shell = createShell();

describe('CurlBinaryInstallerPlugin', () => {
  let plugin: CurlBinaryInstallerPlugin;
  let mockFs: IFileSystem;
  let mockDownloader: IDownloader;
  let mockHookExecutor: HookExecutor;

  beforeEach(() => {
    mockFs = {} as IFileSystem;
    mockDownloader = {} as IDownloader;
    mockHookExecutor = {} as HookExecutor;

    plugin = new CurlBinaryInstallerPlugin(mockFs, mockDownloader, mockHookExecutor, shell);
  });

  it('should have correct plugin metadata', () => {
    expect(plugin.method).toBe('curl-binary');
    expect(plugin.displayName).toBe('Curl Binary Installer');
    expect(plugin.version).toBe('1.0.0');
  });

  it('should have valid schemas', () => {
    expect(plugin.paramsSchema).toBeDefined();
    expect(plugin.toolConfigSchema).toBeDefined();
  });

  it('should validate correct params', () => {
    const validParams = {
      url: 'https://example.com/tool-binary',
    };

    const result = plugin.paramsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should validate params with optional version fields', () => {
    const validParams = {
      url: 'https://example.com/tool-binary',
      versionArgs: ['--version'],
      versionRegex: 'v(\\d+\\.\\d+\\.\\d+)',
    };

    const result = plugin.paramsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should reject params without url', () => {
    const invalidParams = {};

    const result = plugin.paramsSchema.safeParse(invalidParams);
    expect(result.success).toBe(false);
  });

  it('should reject params with invalid url', () => {
    const invalidParams = {
      url: 'not-a-url',
    };

    const result = plugin.paramsSchema.safeParse(invalidParams);
    expect(result.success).toBe(false);
  });

  it('should validate correct tool config', () => {
    const validConfig: CurlBinaryToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      binaries: ['test-tool'],
      installationMethod: 'curl-binary',
      installParams: {
        url: 'https://example.com/tool-binary',
      },
    };

    const result = plugin.toolConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it('should not support update checking', () => {
    expect(plugin.supportsUpdateCheck()).toBe(false);
  });

  it('should not support updates', () => {
    expect(plugin.supportsUpdate()).toBe(false);
  });

  it('should not support readme', () => {
    expect(plugin.supportsReadme()).toBe(false);
  });

  describe('install', () => {
    let logger: TestLogger;
    let context: IInstallContext;

    beforeEach(() => {
      logger = new TestLogger();
      mockFs = {
        chmod: mock(() => Promise.resolve()),
        exists: mock(() => Promise.resolve(true)),
        copyFile: mock(() => Promise.resolve()),
        rm: mock(() => Promise.resolve()),
      } as unknown as IFileSystem;
      mockDownloader = {
        download: mock(() => Promise.resolve('/path/to/download')),
      } as unknown as IDownloader;
      mockHookExecutor = {
        executeHook: mock(() => Promise.resolve({ success: true })),
      } as unknown as HookExecutor;
      context = {
        stagingDir: '/install/dir',
        version: '1.0.0',
        projectConfig: {
          paths: {
            binariesDir: '/path/to/binaries',
            homeDir: '/home/user',
            dotfilesDir: '/home/user/.dotfiles',
            targetDir: '/home/user/.local/bin',
            generatedDir: '/home/user/.dotfiles/.generated',
            toolConfigsDir: '/home/user/.dotfiles/tools',
            shellScriptsDir: '/home/user/.dotfiles/.generated/shell-scripts',
          },
        },
      } as unknown as IInstallContext;

      plugin = new CurlBinaryInstallerPlugin(mockFs, mockDownloader, mockHookExecutor, shell);
    });

    it('should return success result with binary paths and metadata', async () => {
      const toolConfig: CurlBinaryToolConfig = {
        name: 'test-tool',
        version: '1.0.0',
        binaries: ['test-tool'],
        installationMethod: 'curl-binary',
        installParams: {
          url: 'https://example.com/test-tool-v1.0.0',
        },
      };

      const result = await plugin.install('test-tool', toolConfig, context, undefined, logger);

      assert(result.success);
      assert(result.metadata);
      expect(result.binaryPaths).toEqual(['/install/dir/test-tool']);
      expect(result.metadata.method).toBe('curl-binary');
      expect(result.metadata.binaryUrl).toBe('https://example.com/test-tool-v1.0.0');
      expect(result.version).toBe('1.0.0');
    });

    it('should return failure result when installation fails', async () => {
      const toolConfig = {
        name: 'test-tool',
        version: '1.0.0',
        binaries: ['test-tool'],
        installationMethod: 'curl-binary',
        installParams: {},
      } as unknown as CurlBinaryToolConfig;

      const result = await plugin.install('test-tool', toolConfig, context, undefined, logger);

      assert(!result.success);
      expect(result.error).toBe('URL not specified in installParams');
    });

    it('should return failure result when download fails', async () => {
      mockDownloader = {
        download: mock(() => Promise.reject(new Error('Connection refused'))),
      } as unknown as IDownloader;
      plugin = new CurlBinaryInstallerPlugin(mockFs, mockDownloader, mockHookExecutor, shell);

      const toolConfig: CurlBinaryToolConfig = {
        name: 'test-tool',
        version: '1.0.0',
        binaries: ['test-tool'],
        installationMethod: 'curl-binary',
        installParams: {
          url: 'https://example.com/test-tool',
        },
      };

      const result = await plugin.install('test-tool', toolConfig, context, undefined, logger);

      assert(!result.success);
      expect(result.error).toBe('Connection refused');
    });
  });
});
