import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import type { PlatformConfigEntry, ToolConfig } from '@dotfiles/core';
import { Platform } from '@dotfiles/core';
import {
  createGithubReleaseToolConfig,
  createInstallerTestSetup,
  type InstallerTestSetup,
  MOCK_TOOL_NAME,
  MOCK_TOOL_REPO,
} from './installer-test-helpers';

describe('Installer - install (orchestrator)', () => {
  let setup: InstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
  });

  it('should create installation directory', async () => {
    const toolConfig = createGithubReleaseToolConfig();

    await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    // Check that ensureDir was called with a timestamped directory
    const ensureDirCalls = setup.fileSystemMocks.ensureDir.mock.calls;
    const installDirCall = ensureDirCalls.find(
      (call) => call[0].includes(MOCK_TOOL_NAME) && call[0].match(/\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}/)
    );
    expect(installDirCall).toBeDefined();
  });

  it('should call the appropriate installation method based on installationMethod', async () => {
    const toolConfig = createGithubReleaseToolConfig();

    const installSpy = spyOn(setup.pluginRegistry, 'install').mockResolvedValue({
      success: true,
      binaryPaths: [setup.mockToolBinaryPath],
      version: '1.0.0',
      originalTag: 'v1.0.0',
      metadata: {
        method: 'github-release',
        releaseUrl: 'https://github.com/test/repo/releases/tag/v1.0.0',
        publishedAt: '2024-01-01T00:00:00Z',
        releaseName: 'Release v1.0.0',
        downloadUrl: 'https://github.com/test/repo/releases/download/v1.0.0/asset.tar.gz',
        assetName: 'test-asset.tar.gz',
      },
    });

    await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    expect(installSpy).toHaveBeenCalledWith(
      'github-release', // method
      MOCK_TOOL_NAME, // toolName
      toolConfig, // toolConfig
      expect.objectContaining({ toolName: MOCK_TOOL_NAME }), // context
      undefined // options
    );

    installSpy.mockRestore();
  });

  it('should handle errors during installation', async () => {
    const toolConfig = createGithubReleaseToolConfig();

    const error = new Error('Test error');
    const installSpy = spyOn(setup.pluginRegistry, 'install').mockRejectedValue(error);

    const result = await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    expect(result).toEqual({
      success: false,
      error: 'Test error',
      installationMethod: 'github-release',
    });

    installSpy.mockRestore();
  });

  it('should run hooks if defined', async () => {
    const beforeInstallHook = mock(() => Promise.resolve());
    const afterInstallHook = mock(() => Promise.resolve());

    const toolConfig = createGithubReleaseToolConfig({
      installParams: {
        repo: MOCK_TOOL_REPO,
        hooks: {
          'before-install': [beforeInstallHook],
          'after-install': [afterInstallHook],
        },
      },
    });

    const installSpy = spyOn(setup.pluginRegistry, 'install').mockResolvedValue({
      success: true,
      binaryPaths: [setup.mockToolBinaryPath],
      version: '1.0.0',
      originalTag: 'v1.0.0',
      metadata: {
        method: 'github-release',
        releaseUrl: 'https://github.com/test/repo/releases/tag/v1.0.0',
        publishedAt: '2024-01-01T00:00:00Z',
        releaseName: 'Release v1.0.0',
        downloadUrl: 'https://github.com/test/repo/releases/download/v1.0.0/asset.tar.gz',
        assetName: 'test-asset.tar.gz',
      },
    });

    await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    expect(beforeInstallHook).toHaveBeenCalledTimes(1);
    expect(afterInstallHook).toHaveBeenCalledTimes(1);

    installSpy.mockRestore();
  });

  it('should work when only platform-specific configurations are defined', async () => {
    // Test that platform configs can customize binaries while
    // maintaining the base installation method

    const macosConfig: PlatformConfigEntry = {
      platforms: Platform.MacOS,
      architectures: undefined,
      config: {
        binaries: ['eza-macos'],
      },
    };

    const linuxConfig: PlatformConfigEntry = {
      platforms: Platform.Linux,
      architectures: undefined,
      config: {
        binaries: ['eza-linux'],
      },
    };

    const toolConfig: ToolConfig = {
      name: 'eza',
      binaries: ['eza'],
      version: 'latest',
      installationMethod: 'manual',
      installParams: {},
      platformConfigs: [macosConfig, linuxConfig],
    };

    const installSpy = spyOn(setup.pluginRegistry, 'install').mockResolvedValue({
      success: true,
      binaryPaths: [setup.mockToolBinaryPath],
      version: '1.0.0',
      metadata: {
        method: 'manual',
        manualInstall: true,
      },
    });

    const result = await setup.installer.install('eza', toolConfig);
    expect(result.success).toBe(true);
    expect(installSpy).toHaveBeenCalledWith(
      'manual', // method stays manual
      'eza', // toolName
      expect.objectContaining({
        installationMethod: 'manual',
        // Platform config should have customized binaries based on current platform
        binaries: expect.arrayContaining(['eza-macos']), // Assuming test runs on macOS
      }),
      expect.objectContaining({ toolName: 'eza' }),
      undefined // options
    );

    installSpy.mockRestore();
  });
});
