import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import { createShell, Platform } from '@dotfiles/core';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor } from '@dotfiles/installer';
import type { DmgToolConfig } from '@dotfiles/installer-dmg';
import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { DmgInstallerPlugin } from '../DmgInstallerPlugin';

const shell = createShell();

describe('DmgInstallerPlugin', () => {
  let plugin: DmgInstallerPlugin;
  let mockFs: IFileSystem;
  let mockDownloader: IDownloader;
  let mockArchiveExtractor: IArchiveExtractor;
  let mockHookExecutor: HookExecutor;

  beforeEach(() => {
    mockFs = {} as IFileSystem;
    mockDownloader = {} as IDownloader;
    mockArchiveExtractor = {} as IArchiveExtractor;
    mockHookExecutor = {} as HookExecutor;

    plugin = new DmgInstallerPlugin(mockFs, mockDownloader, mockArchiveExtractor, mockHookExecutor, shell);
  });

  it('should have correct plugin metadata', () => {
    expect(plugin.method).toBe('dmg');
    expect(plugin.displayName).toBe('DMG Installer');
    expect(plugin.version).toBe('1.0.0');
  });

  it('should have valid schemas', () => {
    expect(plugin.paramsSchema).toBeDefined();
    expect(plugin.toolConfigSchema).toBeDefined();
  });

  it('should validate correct params', () => {
    const validParams = {
      url: 'https://example.com/app.dmg',
    };

    const result = plugin.paramsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should reject invalid URL in params', () => {
    const invalidParams = {
      url: 'not-a-url',
    };

    const result = plugin.paramsSchema.safeParse(invalidParams);
    expect(result.success).toBe(false);
  });

  it('should validate correct tool config', () => {
    const validConfig: DmgToolConfig = {
      name: 'test-app',
      version: '1.0.0',
      binaries: ['test-app'],
      installationMethod: 'dmg',
      installParams: {
        url: 'https://example.com/app.dmg',
      },
    };

    const result = plugin.toolConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it('should not support updates', () => {
    expect(plugin.supportsUpdate()).toBe(false);
    expect(plugin.supportsUpdateCheck()).toBe(false);
    expect(plugin.supportsReadme()).toBe(false);
  });

  describe('validate', () => {
    it('should return valid with warning on non-macOS', async () => {
      const context = {
        systemInfo: { platform: Platform.Linux },
      } as never;

      const result = await plugin.validate(context);
      expect(result.valid).toBe(true);
      expect(result.warnings).toEqual(['DMG installer only works on macOS']);
    });

    it('should return valid on macOS when hdiutil exists', async () => {
      const mockShell = mock(() => ({
        quiet: mock(() => Promise.resolve()),
      }));
      const macPlugin = new DmgInstallerPlugin(
        mockFs,
        mockDownloader,
        mockArchiveExtractor,
        mockHookExecutor,
        mockShell as unknown as ReturnType<typeof createShell>,
      );

      const context = {
        systemInfo: { platform: Platform.MacOS },
      } as never;

      const result = await macPlugin.validate(context);
      expect(result.valid).toBe(true);
    });

    it('should return invalid on macOS when hdiutil is missing', async () => {
      const mockShell = mock(() => ({
        quiet: mock(() => Promise.reject(new Error('not found'))),
      }));
      const macPlugin = new DmgInstallerPlugin(
        mockFs,
        mockDownloader,
        mockArchiveExtractor,
        mockHookExecutor,
        mockShell as unknown as ReturnType<typeof createShell>,
      );

      const context = {
        systemInfo: { platform: Platform.MacOS },
      } as never;

      const result = await macPlugin.validate(context);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(['hdiutil not found — required for DMG installation']);
    });
  });
});
