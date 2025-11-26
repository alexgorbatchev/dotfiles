import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { InstallContext } from '@dotfiles/core';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor } from '@dotfiles/installer';
import type { CargoToolConfig } from '@dotfiles/installer-cargo';
import { TestLogger } from '@dotfiles/logger';
import { CargoInstallerPlugin } from '../CargoInstallerPlugin';
import type { ICargoClient } from '../cargo-client';

describe('CargoInstallerPlugin', () => {
  let logger: TestLogger;
  let plugin: CargoInstallerPlugin;
  let mockFs: IFileSystem;
  let mockDownloader: IDownloader;
  let mockCargoClient: ICargoClient;
  let mockArchiveExtractor: IArchiveExtractor;
  let mockHookExecutor: HookExecutor;

  beforeEach(() => {
    logger = new TestLogger();
    mockFs = {} as IFileSystem;
    mockDownloader = {} as IDownloader;
    mockCargoClient = {} as ICargoClient;
    mockArchiveExtractor = {} as IArchiveExtractor;
    mockHookExecutor = {} as HookExecutor;

    plugin = new CargoInstallerPlugin(
      logger,
      mockFs,
      mockDownloader,
      mockCargoClient,
      mockArchiveExtractor,
      mockHookExecutor,
      'https://github.com'
    );
  });

  it('should have correct plugin metadata', () => {
    expect(plugin.method).toBe('cargo');
    expect(plugin.displayName).toBe('Cargo Installer');
    expect(plugin.version).toBe('1.0.0');
  });

  it('should have valid schemas', () => {
    expect(plugin.paramsSchema).toBeDefined();
    expect(plugin.toolConfigSchema).toBeDefined();
  });

  it('should validate correct params', () => {
    const validParams = {
      crateName: 'test-crate',
      versionSource: 'cargo-toml' as const,
    };

    const result = plugin.paramsSchema.safeParse(validParams);
    expect(result.success).toBe(true);
  });

  it('should validate correct tool config', () => {
    const validConfig: CargoToolConfig = {
      name: 'test-tool',
      version: '1.0.0',
      binaries: ['test-tool'],
      installationMethod: 'cargo',
      installParams: {
        crateName: 'test-crate',
      },
    };

    const result = plugin.toolConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  describe('resolveVersion', () => {
    let mockContext: InstallContext;

    beforeEach(() => {
      mockContext = {} as InstallContext;
    });

    it('should resolve version from crates.io', async () => {
      const mockToolConfig: CargoToolConfig = {
        name: 'test-tool',
        version: 'latest',
        binaries: ['test-tool'],
        installationMethod: 'cargo',
        installParams: {
          crateName: 'test-crate',
        },
      };

      mockCargoClient.getLatestVersion = mock(async () => '1.2.3');

      const version: string | null = await plugin.resolveVersion('test-tool', mockToolConfig, mockContext, logger);

      expect(version).toBe('1.2.3');
      expect(mockCargoClient.getLatestVersion).toHaveBeenCalledWith('test-crate');
    });

    it('should return null when crates.io query fails', async () => {
      const mockToolConfig: CargoToolConfig = {
        name: 'test-tool',
        version: 'latest',
        binaries: ['test-tool'],
        installationMethod: 'cargo',
        installParams: {
          crateName: 'test-crate',
        },
      };

      mockCargoClient.getLatestVersion = mock(async () => null);

      const version: string | null = await plugin.resolveVersion('test-tool', mockToolConfig, mockContext, logger);

      expect(version).toBeNull();
    });

    it('should return null when exception occurs', async () => {
      const mockToolConfig: CargoToolConfig = {
        name: 'test-tool',
        version: 'latest',
        binaries: ['test-tool'],
        installationMethod: 'cargo',
        installParams: {
          crateName: 'test-crate',
        },
      };

      mockCargoClient.getLatestVersion = mock(async () => {
        throw new Error('Network error');
      });

      const version: string | null = await plugin.resolveVersion('test-tool', mockToolConfig, mockContext, logger);

      expect(version).toBeNull();
    });

    it('should normalize version by stripping v prefix', async () => {
      const mockToolConfig: CargoToolConfig = {
        name: 'test-tool',
        version: 'latest',
        binaries: ['test-tool'],
        installationMethod: 'cargo',
        installParams: {
          crateName: 'test-crate',
        },
      };

      mockCargoClient.getLatestVersion = mock(async () => 'v15.1.0');

      const version: string | null = await plugin.resolveVersion('test-tool', mockToolConfig, mockContext, logger);

      expect(version).toBe('15.1.0');
    });
  });
});
