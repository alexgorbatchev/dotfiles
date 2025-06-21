import { setupServices as actualSetupServices } from '@cli';
import { exitCli as actualExitCli } from '@modules/cli/exitCli';
import type { AppConfig } from '@modules/config';
import { loadSingleToolConfig as actualLoadSingleToolConfig } from '@modules/config-loader/loadToolConfigs';
import type { IFileSystem } from '@modules/file-system';
import type { IGitHubApiClient } from '@modules/github-client';
import type { IInstaller, InstallResult } from '@modules/installer';
import { createClientLogger as actualCreateClientLogger } from '@modules/logger';
import { VersionComparisonStatus, type IVersionChecker } from '@modules/version-checker';
import { createMockClientLogger, type LoggerMocks } from '@testing-helpers';
import type { GitHubRelease, GithubReleaseToolConfig, ToolConfig } from '@types';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Command } from 'commander';
import { registerUpdateCommand } from '../updateCommand';

// --- Mocking Core Dependencies ---
const mockActualLoadSingleToolConfig = mock(actualLoadSingleToolConfig);
mock.module('@modules/config-loader/loadToolConfigs', () => ({
  loadSingleToolConfig: mockActualLoadSingleToolConfig,
  loadToolConfigsFromDirectory: mock(async () => ({})), 
}));

const mockActualExitCli = mock(actualExitCli);
mock.module('@modules/cli/exitCli', () => ({
  exitCli: mockActualExitCli,
}));

const mockActualSetupServices = mock(actualSetupServices);
mock.module('@cli', () => ({
  setupServices: mockActualSetupServices,
}));

const mockCreateClientLogger = mock(actualCreateClientLogger);
mock.module('@modules/logger', () => ({
  createClientLogger: mockCreateClientLogger,
  createLogger: mock(() => mock(() => {})), 
}));
// --- End Mocking Core Dependencies ---

describe('updateCommand', () => {
  let program: Command;
  let mockAppConfig: Partial<AppConfig>;
  let mockFileSystem: Partial<IFileSystem>;
  let mockGitHubApiClient: Partial<IGitHubApiClient>;
  let mockInstallerService: Partial<IInstaller>;
  let mockVersionChecker: Partial<IVersionChecker>;
  let loggerMocks: LoggerMocks;

  const fzfToolConfig: GithubReleaseToolConfig = {
    name: 'fzf',
    version: '0.40.0',
    installationMethod: 'github-release',
    installParams: { repo: 'junegunn/fzf' },
    binaries: ['fzf'],
  };

  const manualToolConfig: ToolConfig = {
    name: 'manualtool',
    version: '1.0.0',
    installationMethod: 'manual',
    installParams: { binaryPath: '/usr/local/bin/manualtool' },
    binaries: ['manualtool'],
  };
  
  const latestGitHubRelease: GitHubRelease = {
    id: 1,
    tag_name: 'v0.41.0', 
    name: 'Release v0.41.0',
    draft: false,
    prerelease: false,
    created_at: new Date().toISOString(),
    published_at: new Date().toISOString(),
    assets: [],
    html_url: 'https://github.com/junegunn/fzf/releases/tag/v0.41.0',
    body: 'Release body'
  };

  beforeEach(() => {
    program = new Command();

    mockAppConfig = {
      toolConfigsDir: '/fake/tools',
      binDir: '/fake/bin', // Used by mockInstallerService
    };

    mockFileSystem = {
      exists: mock(async () => true),
      readFile: mock(async () => JSON.stringify({})), 
    };

    mockGitHubApiClient = {
      getLatestRelease: mock(async (_owner: string, _repo: string): Promise<GitHubRelease | null> => latestGitHubRelease),
    };

    mockInstallerService = {
      install: mock(async (toolName: string, tc: ToolConfig, _opts?: any): Promise<InstallResult> => ({
        success: true,
        binaryPath: `${mockAppConfig.binDir}/${toolName}`, // Use mockAppConfig here
        version: tc.version || 'installed-version',
      })),
    };

    mockVersionChecker = {
      checkVersionStatus: mock(async () => VersionComparisonStatus.NEWER_AVAILABLE),
      getLatestToolVersion: mock(async () => '0.41.0'), 
    };

    const { mockClientLogger: mcl, loggerMocks: lm } = createMockClientLogger();
    loggerMocks = lm;
    mockCreateClientLogger.mockReturnValue(mcl);

    mockActualLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    mockActualExitCli.mockImplementation((code: number) => {
      throw new Error(`MOCK_EXIT_CLI_CALLED_WITH_${code}`);
    });

    mockActualSetupServices.mockResolvedValue({
      appConfig: mockAppConfig as AppConfig,
      fs: mockFileSystem as IFileSystem,
      githubApiClient: mockGitHubApiClient as IGitHubApiClient,
      installer: mockInstallerService as IInstaller,
      versionChecker: mockVersionChecker as IVersionChecker,
      downloader: {} as any,
      githubApiCache: {} as any,
      shimGenerator: {} as any,
      shellInitGenerator: {} as any,
      symlinkGenerator: {} as any,
      generatorOrchestrator: {} as any,
      archiveExtractor: {} as any,
    });
    
    registerUpdateCommand(
      program
    );
  });

  afterEach(() => {
    mock.restore(); 
    process.exitCode = 0; 
  });

  test('tool is up-to-date', async () => {
    mockActualLoadSingleToolConfig.mockResolvedValue(fzfToolConfig); 
    (mockGitHubApiClient.getLatestRelease as any).mockResolvedValue({ ...latestGitHubRelease, tag_name: 'v0.40.0' });
    (mockVersionChecker.checkVersionStatus as any).mockResolvedValue(VersionComparisonStatus.UP_TO_DATE);

    await program.parseAsync(['update', 'fzf'], { from: 'user' });

    expect(loggerMocks.info).toHaveBeenCalledWith('Checking for updates for "fzf"...');
    expect(loggerMocks.info).toHaveBeenCalledWith('fzf (version 0.40.0) is already up to date. Latest: 0.40.0.');
    expect(mockInstallerService.install).not.toHaveBeenCalled();
  });

  test('update available, successful installation', async () => {
    mockActualLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    (mockGitHubApiClient.getLatestRelease as any).mockResolvedValue(latestGitHubRelease);
    (mockVersionChecker.checkVersionStatus as any).mockResolvedValue(VersionComparisonStatus.NEWER_AVAILABLE);
    (mockInstallerService.install as any).mockResolvedValue({ success: true, version: '0.41.0' });

    await program.parseAsync(['update', 'fzf'], { from: 'user' });

    expect(loggerMocks.info).toHaveBeenCalledWith('Update available for fzf: 0.40.0 -> 0.41.0.');
    expect(loggerMocks.info).toHaveBeenCalledWith('Updating fzf from 0.40.0 to 0.41.0...');
    expect(mockInstallerService.install).toHaveBeenCalledWith(
      'fzf',
      expect.objectContaining({ name: 'fzf', version: '0.41.0' }),
      { force: true }
    );
    expect(loggerMocks.success).toHaveBeenCalledWith('fzf updated successfully to 0.41.0.');
  });

  test('update available, installation fails', async () => {
    mockActualLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    (mockGitHubApiClient.getLatestRelease as any).mockResolvedValue(latestGitHubRelease);
    (mockVersionChecker.checkVersionStatus as any).mockResolvedValue(VersionComparisonStatus.NEWER_AVAILABLE);
    (mockInstallerService.install as any).mockResolvedValue({ success: false, error: 'Install failed miserably' });

    await expect(program.parseAsync(['update', 'fzf'], { from: 'user' }))
      .rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

    expect(loggerMocks.error).toHaveBeenCalledWith('Failed to update fzf: Install failed miserably');
    expect(mockActualExitCli).toHaveBeenCalledWith(1);
  });

  test('tool config not found', async () => {
    mockActualLoadSingleToolConfig.mockResolvedValue(undefined);

    await expect(program.parseAsync(['update', 'nonexistent'], { from: 'user' }))
      .rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

    expect(loggerMocks.error).toHaveBeenCalledWith('Tool configuration for "nonexistent" not found in /fake/tools.');
    expect(mockActualExitCli).toHaveBeenCalledWith(1);
  });

  test('unsupported installation method', async () => {
    mockActualLoadSingleToolConfig.mockResolvedValue(manualToolConfig);

    await program.parseAsync(['update', 'manualtool'], { from: 'user' });

    expect(loggerMocks.info).toHaveBeenCalledWith('Checking for updates for "manualtool"...');
    expect(loggerMocks.info).toHaveBeenCalledWith('Update not yet supported for installation method: "manual" for tool "manualtool".');
    expect(mockInstallerService.install).not.toHaveBeenCalled();
  });
  
  test('GitHub API error when fetching latest release', async () => {
    mockActualLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    (mockGitHubApiClient.getLatestRelease as any).mockRejectedValue(new Error('GitHub API Down'));

    const exitCliCallsBefore = (mockActualExitCli as any).mock.calls.length;
    await program.parseAsync(['update', 'fzf'], { from: 'user' });
    const exitCliCallsAfter = (mockActualExitCli as any).mock.calls.length;

    expect(loggerMocks.error).toHaveBeenCalledWith('Error fetching latest release for fzf from junegunn/fzf: GitHub API Down');
    expect(mockInstallerService.install).not.toHaveBeenCalled();
    expect(exitCliCallsAfter).toBe(exitCliCallsBefore);
  });
  
  test('tool configured with "latest" version', async () => {
    const fzfLatestConfig = { ...fzfToolConfig, version: 'latest' };
    mockActualLoadSingleToolConfig.mockResolvedValue(fzfLatestConfig);
    (mockGitHubApiClient.getLatestRelease as any).mockResolvedValue({ ...latestGitHubRelease, tag_name: 'v0.50.0' });

    await program.parseAsync(['update', 'fzf'], { from: 'user' });

    expect(loggerMocks.info).toHaveBeenCalledWith(
      'Tool "fzf" is configured to \'latest\'. Current latest is 0.50.0. To install this specific version, re-install or use update with a specific version target (not yet supported).'
    );
    expect(mockInstallerService.install).not.toHaveBeenCalled();
  });

  test('invalid repo format in tool config', async () => {
    const invalidRepoConfig: GithubReleaseToolConfig = {
      ...fzfToolConfig,
      name: 'invalidrepo',
      installParams: { repo: 'justonename' }
    };
    mockActualLoadSingleToolConfig.mockResolvedValue(invalidRepoConfig);
    
    await program.parseAsync(['update', 'invalidrepo'], { from: 'user' });
    
    expect(loggerMocks.warn).toHaveBeenCalledWith("Invalid 'repo' format for \"invalidrepo\": justonename. Expected 'owner/repo'. Cannot update.");
    expect(mockInstallerService.install).not.toHaveBeenCalled();
  });

  test('missing repo in github-release tool config', async () => {
    const missingRepoConfig = {
      ...fzfToolConfig,
      name: 'missingrepo',
      installParams: { }
    } as GithubReleaseToolConfig;
    mockActualLoadSingleToolConfig.mockResolvedValue(missingRepoConfig);
    
    await program.parseAsync(['update', 'missingrepo'], { from: 'user' });
    
    expect(loggerMocks.warn).toHaveBeenCalledWith("Tool \"missingrepo\" is 'github-release' but missing 'repo' in installParams. Cannot update.");
    expect(mockInstallerService.install).not.toHaveBeenCalled();
  });

  test('error during loadSingleToolConfig', async () => {
    const loadError = new Error('Failed to load config file');
    mockActualLoadSingleToolConfig.mockRejectedValue(loadError);

    await expect(program.parseAsync(['update', 'sometool'], { from: 'user' }))
      .rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');
    
    expect(loggerMocks.error).toHaveBeenCalledWith('Error loading configuration for tool "sometool": Failed to load config file');
    expect(mockActualExitCli).toHaveBeenCalledWith(1);
  });

  test('handles AHEAD_OF_LATEST status from version checker', async () => {
    mockActualLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    (mockGitHubApiClient.getLatestRelease as any).mockResolvedValue({ ...latestGitHubRelease, tag_name: 'v0.39.0' });
    (mockVersionChecker.checkVersionStatus as any).mockResolvedValue(VersionComparisonStatus.AHEAD_OF_LATEST);

    await program.parseAsync(['update', 'fzf'], { from: 'user' });

    expect(loggerMocks.warn).toHaveBeenCalledWith('fzf (version 0.40.0) status is AHEAD_OF_LATEST compared to latest (0.39.0). No action taken.');
    expect(mockInstallerService.install).not.toHaveBeenCalled();
  });

  test('handles INVALID_CURRENT_VERSION status from version checker', async () => {
    const invalidVersionConfig = { ...fzfToolConfig, version: 'not-semver' };
    mockActualLoadSingleToolConfig.mockResolvedValue(invalidVersionConfig);
    (mockGitHubApiClient.getLatestRelease as any).mockResolvedValue(latestGitHubRelease);
    (mockVersionChecker.checkVersionStatus as any).mockResolvedValue(VersionComparisonStatus.INVALID_CURRENT_VERSION);

    await program.parseAsync(['update', 'fzf'], { from: 'user' });

    expect(loggerMocks.warn).toHaveBeenCalledWith('fzf (version not-semver) status is INVALID_CURRENT_VERSION compared to latest (0.41.0). No action taken.');
    expect(mockInstallerService.install).not.toHaveBeenCalled();
  });
});