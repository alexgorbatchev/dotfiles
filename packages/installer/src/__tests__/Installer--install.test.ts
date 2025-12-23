import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import path from 'node:path';
import type { IInstallContext, PlatformConfigEntry, ToolConfig } from '@dotfiles/core';
import { Platform } from '@dotfiles/core';
import {
  createGithubReleaseToolConfig,
  createInstallerTestSetup,
  type IInstallerTestSetup,
  MOCK_TOOL_NAME,
  MOCK_TOOL_REPO,
} from './installer-test-helpers';

describe('Installer - install (orchestrator)', () => {
  let setup: IInstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
    // Create the mock binary file so symlink creation succeeds
    await setup.fs.ensureDir(path.dirname(setup.mockToolBinaryPath));
    await setup.fs.writeFile(setup.mockToolBinaryPath, 'mock binary content');
    await setup.fs.chmod(setup.mockToolBinaryPath, 0o755);
  });

  it('should create installation directory', async () => {
    const toolConfig = createGithubReleaseToolConfig();

    await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    // Check that ensureDir was called with a per-attempt staging directory (UUID)
    const ensureDirCalls = setup.fileSystemMocks.ensureDir.mock.calls;
    const stagingDirCall = ensureDirCalls.find((call) => {
      const firstArg: string | undefined = call[0];
      return Boolean(
        firstArg?.includes(MOCK_TOOL_NAME) &&
          /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(firstArg)
      );
    });
    expect(stagingDirCall).toBeDefined();
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

    const installSpy = spyOn(setup.pluginRegistry, 'install').mockImplementation(
      async (_method: string, _name: string, _config: unknown, context: IInstallContext) => {
        // Create the binary in a temporary location (mimicking what a real plugin does)
        const binaryPath = path.join(context.stagingDir, MOCK_TOOL_NAME);
        await setup.fs.ensureDir(path.dirname(binaryPath));
        await setup.fs.writeFile(binaryPath, 'mock binary content');
        await setup.fs.chmod(binaryPath, 0o755);

        return {
          success: true,
          binaryPaths: [binaryPath],
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
        };
      }
    );

    const result = await setup.installer.install(MOCK_TOOL_NAME, toolConfig);
    if (!result.success) {
      throw new Error(`Installation failed: ${result.error}`);
    }

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
