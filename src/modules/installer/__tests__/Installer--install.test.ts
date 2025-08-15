import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import type { CargoInstallParams, PlatformConfigEntry, ToolConfig } from '@types';
import { Platform } from '@types';
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

    const installFromGitHubReleaseSpy = spyOn(setup.installer, 'installFromGitHubRelease').mockResolvedValue({
      success: true,
      binaryPaths: [setup.mockToolBinaryPath],
    });

    await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    expect(installFromGitHubReleaseSpy).toHaveBeenCalledWith(
      MOCK_TOOL_NAME,
      toolConfig,
      expect.objectContaining({ toolName: MOCK_TOOL_NAME }),
      undefined,
      expect.any(Object), // logger parameter
      expect.any(Object) // toolFs parameter
    );

    installFromGitHubReleaseSpy.mockRestore();
  });

  it('should handle errors during installation', async () => {
    const toolConfig = createGithubReleaseToolConfig();

    const error = new Error('Test error');
    const installFromGitHubReleaseSpy = spyOn(setup.installer, 'installFromGitHubRelease').mockRejectedValue(error);

    const result = await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    expect(result).toEqual({
      success: false,
      error: 'Test error',
    });

    installFromGitHubReleaseSpy.mockRestore();
  });

  it('should run hooks if defined', async () => {
    const beforeInstallHook = mock(() => Promise.resolve());
    const afterInstallHook = mock(() => Promise.resolve());

    const toolConfig = createGithubReleaseToolConfig({
      installParams: {
        repo: MOCK_TOOL_REPO,
        hooks: {
          beforeInstall: beforeInstallHook,
          afterInstall: afterInstallHook,
        },
      },
    });

    const installFromGitHubReleaseSpy = spyOn(setup.installer, 'installFromGitHubRelease').mockResolvedValue({
      success: true,
      binaryPaths: [setup.mockToolBinaryPath],
    });

    await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    expect(beforeInstallHook).toHaveBeenCalledTimes(1);
    expect(afterInstallHook).toHaveBeenCalledTimes(1);

    installFromGitHubReleaseSpy.mockRestore();
  });

  it('should work when only platform-specific configurations are defined', async () => {
    // Create a tool config that mimics the eza configuration:
    // - Root level has installationMethod: 'none'
    // - Platform-specific configs have installationMethod: 'cargo'
    const cargoInstallParams: CargoInstallParams = {
      crateName: 'eza',
      binarySource: 'cargo-quickinstall',
      versionSource: 'cargo-toml',
      githubRepo: 'eza-community/eza',
    };

    const macosConfig: PlatformConfigEntry = {
      platforms: Platform.MacOS,
      architectures: undefined,
      config: {
        installationMethod: 'cargo',
        installParams: cargoInstallParams,
      },
    };

    const linuxConfig: PlatformConfigEntry = {
      platforms: Platform.Linux,
      architectures: undefined,
      config: {
        installationMethod: 'cargo',
        installParams: cargoInstallParams,
      },
    };

    const toolConfigWithPlatformSpecificCargo: ToolConfig = {
      name: 'eza',
      binaries: ['eza'],
      version: 'latest',
      installationMethod: 'none',
      installParams: undefined,
      platformConfigs: [macosConfig, linuxConfig],
    };

    const installFromCargoSpy = spyOn(setup.installer, 'installFromCargo').mockResolvedValue({
      success: true,
      binaryPaths: [setup.mockToolBinaryPath],
    });

    // This should resolve the platform-specific config and call installFromCargo
    // instead of failing with "Unsupported installation method: none"
    const result = await setup.installer.install('eza', toolConfigWithPlatformSpecificCargo);

    if (!result.success) {
      throw new Error(`Expected installation to succeed, but got error: ${result.error}`);
    }

    expect(result.success).toBe(true);
    expect(installFromCargoSpy).toHaveBeenCalledWith(
      'eza',
      expect.objectContaining({
        installationMethod: 'cargo',
        installParams: expect.objectContaining({
          crateName: 'eza',
          binarySource: 'cargo-quickinstall',
        }),
      }),
      expect.objectContaining({ toolName: 'eza' }),
      undefined
    );

    installFromCargoSpy.mockRestore();
  });
});
