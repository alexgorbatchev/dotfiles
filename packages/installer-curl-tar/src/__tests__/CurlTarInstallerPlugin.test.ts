import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor } from '@dotfiles/installer';
import type { CurlTarToolConfig } from '@dotfiles/installer-curl-tar';
import { beforeEach, describe, expect, it } from 'bun:test';
import { CurlTarInstallerPlugin } from '../CurlTarInstallerPlugin';

describe('CurlTarInstallerPlugin', () => {
  let plugin: CurlTarInstallerPlugin;
  let mockFs: IFileSystem;
  let mockDownloader: IDownloader;
  let mockArchiveExtractor: IArchiveExtractor;
  let mockHookExecutor: HookExecutor;

  beforeEach(() => {
    mockFs = {} as IFileSystem;
    mockDownloader = {} as IDownloader;
    mockArchiveExtractor = {} as IArchiveExtractor;
    mockHookExecutor = {} as HookExecutor;

    plugin = new CurlTarInstallerPlugin(mockFs, mockDownloader, mockArchiveExtractor, mockHookExecutor);
  });

  it('should have correct plugin metadata', () => {
    expect(plugin.method).toBe('curl-tar');
    expect(plugin.displayName).toBe('Curl Tar Installer');
    expect(plugin.version).toBe('1.0.0');
  });

  it('should have valid schemas', () => {
    expect(plugin.paramsSchema).toBeDefined();
    expect(plugin.toolConfigSchema).toBeDefined();
  });

  it('should validate correct params', () => {
    const validParams = {
      url: 'https://example.com/tool.tar.gz',
    };

    const result = plugin.paramsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should validate correct tool config', () => {
    const validConfig: CurlTarToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      binaries: ['test-tool'],
      installationMethod: 'curl-tar',
      installParams: {
        url: 'https://example.com/tool.tar.gz',
      },
    };

    const result = plugin.toolConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });
});
