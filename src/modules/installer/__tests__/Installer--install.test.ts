import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import path from 'node:path';
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

    expect(setup.fileSystemMocks.ensureDir).toHaveBeenCalledWith(
      path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, toolConfig.version)
    );
  });

  it('should call the appropriate installation method based on installationMethod', async () => {
    const toolConfig = createGithubReleaseToolConfig();

    const installFromGitHubReleaseSpy = spyOn(setup.installer, 'installFromGitHubRelease').mockResolvedValue({
      success: true,
      binaryPath: setup.mockToolBinaryPath,
    });

    await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    expect(installFromGitHubReleaseSpy).toHaveBeenCalledWith(
      MOCK_TOOL_NAME,
      toolConfig,
      expect.objectContaining({ toolName: MOCK_TOOL_NAME }),
      undefined
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
      binaryPath: setup.mockToolBinaryPath,
    });

    await setup.installer.install(MOCK_TOOL_NAME, toolConfig);

    expect(beforeInstallHook).toHaveBeenCalledTimes(1);
    expect(afterInstallHook).toHaveBeenCalledTimes(1);

    installFromGitHubReleaseSpy.mockRestore();
  });
});
