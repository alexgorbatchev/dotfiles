import { beforeEach, describe, expect, it } from 'bun:test';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor } from '@dotfiles/installer';
import type { CurlScriptToolConfig } from '@dotfiles/installer-curl-script';
import { CurlScriptInstallerPlugin } from '../CurlScriptInstallerPlugin';

describe('CurlScriptInstallerPlugin', () => {
  let plugin: CurlScriptInstallerPlugin;
  let mockFs: IFileSystem;
  let mockDownloader: IDownloader;
  let mockHookExecutor: HookExecutor;

  beforeEach(() => {
    mockFs = {} as IFileSystem;
    mockDownloader = {} as IDownloader;
    mockHookExecutor = {} as HookExecutor;

    plugin = new CurlScriptInstallerPlugin(mockFs, mockDownloader, mockHookExecutor);
  });

  it('should have correct plugin metadata', () => {
    expect(plugin.method).toBe('curl-script');
    expect(plugin.displayName).toBe('Curl Script Installer');
    expect(plugin.version).toBe('1.0.0');
  });

  it('should have valid schemas', () => {
    expect(plugin.paramsSchema).toBeDefined();
    expect(plugin.toolConfigSchema).toBeDefined();
  });

  it('should validate correct params', () => {
    const validParams = {
      url: 'https://example.com/install.sh',
      shell: 'bash',
    };

    const result = plugin.paramsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should validate correct tool config', () => {
    const validConfig: CurlScriptToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      binaries: ['test-tool'],
      installationMethod: 'curl-script',
      installParams: {
        url: 'https://example.com/install.sh',
        shell: 'bash',
      },
    };

    const result = plugin.toolConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });
});
