import type { AppConfig } from '@modules/config';
import { loadSingleToolConfig, loadToolConfigsFromDirectory } from '@modules/config-loader';
import type { IFileSystem } from '@modules/file-system';
import type { IGitHubApiClient } from '@modules/github-client';
import { createClientLogger as actualCreateClientLogger } from '@modules/logger';
import type { IVersionChecker } from '@modules/version-checker';
import { VersionComparisonStatus } from '@modules/version-checker';
import { createMockClientLogger, type LoggerMocks } from '@testing-helpers';
import type { GitHubRelease, GithubReleaseToolConfig, ToolConfig } from '@types';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { registerCheckUpdatesCommand } from '../checkUpdatesCommand';
import type { GlobalProgram, Services } from '@cli';
import { createProgram } from '@cli';

mock.module('@modules/config-loader', () => ({
  loadToolConfigsFromDirectory: mock(async () => ({})),
  loadSingleToolConfig: mock(async () => undefined),
}));

const mockCreateClientLogger = mock(actualCreateClientLogger);
mock.module('@modules/logger', () => ({
  createClientLogger: mockCreateClientLogger,
  createLogger: mock(() => mock(() => {})),
}));

describe('checkUpdatesCommand', () => {
  let program: GlobalProgram;
  let mockServices: Services;
  let loggerMocks: LoggerMocks;

  beforeEach(() => {
    mock.restore();

    program = createProgram();

    const mockAppConfig: Partial<AppConfig> = {
      toolConfigsDir: '/fake/tools',
      manifestPath: '/fake/manifest.json',
    };

    const mockFileSystem: Partial<IFileSystem> = {
      exists: mock(async () => true),
      readFile: mock(async () => ''),
      readdir: mock(async () => []),
    };

    const mockVersionChecker: Partial<IVersionChecker> = {
      checkVersionStatus: mock(async () => VersionComparisonStatus.UP_TO_DATE),
    };

    const mockGitHubApiClient: Partial<IGitHubApiClient> = {
      getLatestRelease: mock(
        async (owner: string, repo: string): Promise<GitHubRelease | null> => ({
          id: 123,
          tag_name: '1.0.0',
          name: 'Release 1.0.0',
          draft: false,
          prerelease: false,
          created_at: new Date().toISOString(),
          published_at: new Date().toISOString(),
          assets: [],
          html_url: `https://github.com/${owner}/${repo}/releases/tag/1.0.0`,
          body: 'Release body',
        }),
      ),
    };

    const { mockClientLogger: mcl, loggerMocks: lm } = createMockClientLogger();
    loggerMocks = lm;

    mockCreateClientLogger.mockReturnValue(mcl);

    mockServices = {
      appConfig: mockAppConfig as AppConfig,
      fs: mockFileSystem as IFileSystem,
      versionChecker: mockVersionChecker as IVersionChecker,
      githubApiClient: mockGitHubApiClient as IGitHubApiClient,
    } as Services;

    registerCheckUpdatesCommand(program, mockServices);
  });

  afterEach(() => {
  });

  const fzfToolConfig: GithubReleaseToolConfig = {
    name: 'fzf',
    version: '0.40.0',
    installationMethod: 'github-release',
    installParams: { repo: 'junegunn/fzf' },
    binaries: ['fzf'],
  };

  const lazygitToolConfig: GithubReleaseToolConfig = {
    name: 'lazygit',
    version: '0.35.0',
    installationMethod: 'github-release',
    installParams: { repo: 'jesseduffield/lazygit' },
    binaries: ['lazygit'],
  };

  const manualToolConfig: ToolConfig = {
    name: 'manualtool',
    version: '1.0.0',
    installationMethod: 'manual',
    installParams: { binaryPath: '/usr/local/bin/manualtool' },
    binaries: ['manualtool'],
  };

  test('should report a tool is up-to-date', async () => {
    (loadSingleToolConfig as any).mockResolvedValue(fzfToolConfig);
    (mockServices.githubApiClient.getLatestRelease as any).mockResolvedValue({
      tag_name: 'v0.40.0',
    });
    (mockServices.versionChecker.checkVersionStatus as any).mockResolvedValue(
      VersionComparisonStatus.UP_TO_DATE,
    );

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    expect(loggerMocks.info).toHaveBeenCalledWith('Check-updates command finished.');
    expect(loggerMocks.log).toHaveBeenCalledWith('fzf (0.40.0) is up to date. Latest: 0.40.0');
  });

  test('should report an update is available', async () => {
    (loadSingleToolConfig as any).mockResolvedValue(fzfToolConfig);
    (mockServices.githubApiClient.getLatestRelease as any).mockResolvedValue({
      tag_name: 'v0.41.0',
    });
    (mockServices.versionChecker.checkVersionStatus as any).mockResolvedValue(
      VersionComparisonStatus.NEWER_AVAILABLE,
    );

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    expect(loggerMocks.log).toHaveBeenCalledWith('Update available for fzf: 0.40.0 -> 0.41.0');
  });

  test('should check all tools: one up-to-date, one with update', async () => {
    (loadToolConfigsFromDirectory as any).mockResolvedValue({
      fzf: fzfToolConfig,
      lazygit: lazygitToolConfig,
    });

    (mockServices.githubApiClient.getLatestRelease as any)
      .mockResolvedValueOnce({ tag_name: 'v0.40.0' })
      .mockResolvedValueOnce({ tag_name: 'v0.36.0' });

    (mockServices.versionChecker.checkVersionStatus as any)
      .mockResolvedValueOnce(VersionComparisonStatus.UP_TO_DATE)
      .mockResolvedValueOnce(VersionComparisonStatus.NEWER_AVAILABLE);

    await program.parseAsync(['check-updates'], { from: 'user' });

    expect(loggerMocks.log).toHaveBeenCalledWith('fzf (0.40.0) is up to date. Latest: 0.40.0');
    expect(loggerMocks.log).toHaveBeenCalledWith('Update available for lazygit: 0.35.0 -> 0.36.0');
    expect(loggerMocks.info).toHaveBeenCalledWith('Check-updates command finished.');
  });

  test('should handle tool configured with "latest" version', async () => {
    const fzfLatestConfig: GithubReleaseToolConfig = { ...fzfToolConfig, version: 'latest' };
    (loadSingleToolConfig as any).mockResolvedValue(fzfLatestConfig);
    (mockServices.githubApiClient.getLatestRelease as any).mockResolvedValue({
      tag_name: 'v0.42.0',
    });

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    expect(loggerMocks.log).toHaveBeenCalledWith(
      'Tool "fzf" is configured to \'latest\'. The latest available version is 0.42.0.',
    );
  });

  test('should report unsupported installation method', async () => {
    (loadSingleToolConfig as any).mockResolvedValue(manualToolConfig);
    await program.parseAsync(['check-updates', 'manualtool'], { from: 'user' });

    expect(loggerMocks.log).toHaveBeenCalledWith(
      'Update checking not yet supported for manualtool (method: manual)',
    );
  });

  test('should handle GitHub API error gracefully', async () => {
    (loadSingleToolConfig as any).mockResolvedValue(fzfToolConfig);
    (mockServices.githubApiClient.getLatestRelease as any).mockRejectedValue(
      new Error('GitHub API unavailable'),
    );

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    expect(loggerMocks.error).toHaveBeenCalledWith(
      'Error checking GitHub updates for fzf: GitHub API unavailable',
    );
  });

  test('should handle tool config not found for specific tool', async () => {
    (loadSingleToolConfig as any).mockResolvedValue(undefined);
    // The action handler calls exitCli, which is mocked to throw in tests
    await expect(
      program.parseAsync(['check-updates', 'nonexistenttool'], { from: 'user' }),
    ).rejects.toThrow();
    expect(loggerMocks.error).toHaveBeenCalledWith(
      'Tool configuration for "nonexistenttool" not found in /fake/tools.',
    );
  });

  test('should handle no tool configurations found when checking all', async () => {
    (loadToolConfigsFromDirectory as any).mockResolvedValue({});
    await program.parseAsync(['check-updates'], { from: 'user' });
    expect(loggerMocks.info).toHaveBeenCalledWith(
      'No tool configurations found in /fake/tools.',
    );
  });

  test('should handle invalid repo format in tool config', async () => {
    const invalidRepoConfig: GithubReleaseToolConfig = {
      ...fzfToolConfig,
      name: 'invalidrepo',
      installParams: { repo: 'justonename' },
    };
    (loadSingleToolConfig as any).mockResolvedValue(invalidRepoConfig);

    await program.parseAsync(['check-updates', 'invalidrepo'], { from: 'user' });

    expect(loggerMocks.warn).toHaveBeenCalledWith(
      "Invalid 'repo' format for \"invalidrepo\": justonename. Expected 'owner/repo'. Skipping.",
    );
  });

  test('should handle missing repo in github-release tool config', async () => {
    const missingRepoConfig = {
      ...fzfToolConfig,
      name: 'missingrepo',
      installParams: {},
    } as GithubReleaseToolConfig;
    (loadSingleToolConfig as any).mockResolvedValue(missingRepoConfig);

    await program.parseAsync(['check-updates', 'missingrepo'], { from: 'user' });

    expect(loggerMocks.warn).toHaveBeenCalledWith(
      "Tool \"missingrepo\" is 'github-release' but missing 'repo' in installParams. Skipping.",
    );
  });

  test('should handle error during loadToolConfigsFromDirectory', async () => {
    const errorMessage = 'FS read error';
    (loadToolConfigsFromDirectory as any).mockRejectedValue(new Error(errorMessage));
    await expect(program.parseAsync(['check-updates'], { from: 'user' })).rejects.toThrow();
    expect(loggerMocks.error).toHaveBeenCalledWith(
      'Error loading tool configurations: %s',
      errorMessage,
    );
  });

  test('should handle error during loadSingleToolConfig', async () => {
    const errorMessage = 'FS read error single';
    (loadSingleToolConfig as any).mockRejectedValue(new Error(errorMessage));
    await expect(
      program.parseAsync(['check-updates', 'sometool'], { from: 'user' }),
    ).rejects.toThrow();
    expect(loggerMocks.error).toHaveBeenCalledWith(
      'Error loading tool configurations: %s',
      errorMessage,
    );
  });
});