import type { GlobalProgram, Services } from '@cli';
import { createProgram } from '@cli';
import { exitCli } from '@modules/cli';
import type { YamlConfig } from '@modules/config';
import {
  createYamlConfigFromObject,
  loadSingleToolConfig,
} from '@modules/config-loader';
import type { IGitHubApiClient } from '@modules/github-client';
import type { IInstaller, InstallResult } from '@modules/installer';
import { createClientLogger as actualCreateClientLogger } from '@modules/logger';
import { VersionComparisonStatus, type IVersionChecker } from '@modules/version-checker';
import {
  createMemFileSystem,
  createMockClientLogger,
  type CreateMockClientLoggerResult,
  type MemFileSystemReturn,
} from '@testing-helpers';
import type { GitHubRelease, GithubReleaseToolConfig, ToolConfig } from '@types';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { registerUpdateCommand } from '../updateCommand';
import {
  createModuleMocker,
  setupTestCleanup,
  clearMockRegistry
} from '@rageltd/bun-test-utils';

// Setup cleanup once per file
setupTestCleanup();

const mockModules = createModuleMocker();

const mockActualLoadSingleToolConfig = mock(loadSingleToolConfig);
const mockLoadToolConfigsFromDirectory = mock(async () => ({}));

const mockExitCli = mock(exitCli);

const mockCreateClientLogger = mock(actualCreateClientLogger);
const mockCreateLogger = mock(() => mock(() => {}));

describe('updateCommand', () => {
  let program: GlobalProgram;
  let mockYamlConfig: YamlConfig;
  let mockFs: MemFileSystemReturn;
  let mockGitHubApiClient: Partial<IGitHubApiClient>;
  let mockInstallerService: Partial<IInstaller>;
  let mockVersionChecker: Partial<IVersionChecker>;
  let loggerMocks: CreateMockClientLoggerResult['loggerMocks'];

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
    body: 'Release body',
  };

  beforeEach(async () => {
    program = createProgram();

    mockFs = await createMemFileSystem({
      exists: mock(async () => true),
    });

    mockYamlConfig = await createYamlConfigFromObject(mockFs.fs);

    mockGitHubApiClient = {
      getLatestRelease: mock(
        async (_owner: string, _repo: string): Promise<GitHubRelease | null> => latestGitHubRelease
      ),
    };

    mockInstallerService = {
      install: mock(
        async (toolName: string, tc: ToolConfig, _opts?: any): Promise<InstallResult> => ({
          success: true,
          binaryPath: `${mockYamlConfig.paths.binariesDir}/${toolName}`,
          version: tc.version || 'installed-version',
        })
      ),
    };

    mockVersionChecker = {
      checkVersionStatus: mock(async () => VersionComparisonStatus.NEWER_AVAILABLE),
      getLatestToolVersion: mock(async () => '0.41.0'),
    };

    const { mockClientLogger: mcl, loggerMocks: lm } = createMockClientLogger();
    loggerMocks = lm;
    mockCreateClientLogger.mockReturnValue(mcl);

    mockActualLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    mockExitCli.mockImplementation((code: number) => {
      throw new Error(`MOCK_EXIT_CLI_CALLED_WITH_${code}`);
    });

    // Set up mocks
    await mockModules.mock('@modules/config-loader/loadToolConfigs', () => ({
      loadSingleToolConfig: mockActualLoadSingleToolConfig,
      loadToolConfigsFromDirectory: mockLoadToolConfigsFromDirectory,
    }));

    await mockModules.mock('@modules/cli/exitCli', () => ({
      exitCli: mockExitCli,
    }));

    await mockModules.mock('@modules/logger', () => ({
      createClientLogger: mockCreateClientLogger,
      createLogger: mockCreateLogger,
    }));

    registerUpdateCommand(program, {
      yamlConfig: mockYamlConfig,
      fs: mockFs.fs.asIFileSystem,
      githubApiClient: mockGitHubApiClient as IGitHubApiClient,
      installer: mockInstallerService as IInstaller,
      versionChecker: mockVersionChecker as IVersionChecker,
    } as Services);
  });

  afterEach(() => {
    clearMockRegistry();
  });

  afterAll(() => {
    mockModules.restoreAll();
  });

  test('tool is up-to-date', async () => {
    mockActualLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    (mockGitHubApiClient.getLatestRelease as any).mockResolvedValue({
      ...latestGitHubRelease,
      tag_name: 'v0.40.0',
    });
    (mockVersionChecker.checkVersionStatus as any).mockResolvedValue(
      VersionComparisonStatus.UP_TO_DATE
    );

    await program.parseAsync(['update', 'fzf'], { from: 'user' });

    expect(loggerMocks.info).toHaveBeenCalledWith('Checking for updates for "fzf"...');
    expect(loggerMocks.info).toHaveBeenCalledWith(
      'fzf (version 0.40.0) is already up to date. Latest: 0.40.0.'
    );
    expect(mockInstallerService.install).not.toHaveBeenCalled();
  });

  test('update available, successful installation', async () => {
    mockActualLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    (mockGitHubApiClient.getLatestRelease as any).mockResolvedValue(latestGitHubRelease);
    (mockVersionChecker.checkVersionStatus as any).mockResolvedValue(
      VersionComparisonStatus.NEWER_AVAILABLE
    );
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
    (mockVersionChecker.checkVersionStatus as any).mockResolvedValue(
      VersionComparisonStatus.NEWER_AVAILABLE
    );
    (mockInstallerService.install as any).mockResolvedValue({
      success: false,
      error: 'Install failed miserably',
    });

    await expect(program.parseAsync(['update', 'fzf'], { from: 'user' })).rejects.toThrow(
      'MOCK_EXIT_CLI_CALLED_WITH_1'
    );

    expect(loggerMocks.error).toHaveBeenCalledWith(
      'Failed to update fzf: Install failed miserably'
    );
    expect(mockExitCli).toHaveBeenCalledWith(1);
  });

  test('tool config not found', async () => {
    mockActualLoadSingleToolConfig.mockResolvedValue(undefined);

    await expect(program.parseAsync(['update', 'nonexistent'], { from: 'user' })).rejects.toThrow(
      'MOCK_EXIT_CLI_CALLED_WITH_1'
    );

    expect(loggerMocks.error).toHaveBeenCalledWith(
      `Tool configuration for "nonexistent" not found in ${mockYamlConfig.paths.toolConfigsDir}.`
    );
    expect(mockExitCli).toHaveBeenCalledWith(1);
  });

  test('unsupported installation method', async () => {
    mockActualLoadSingleToolConfig.mockResolvedValue(manualToolConfig);

    await program.parseAsync(['update', 'manualtool'], { from: 'user' });

    expect(loggerMocks.info).toHaveBeenCalledWith('Checking for updates for "manualtool"...');
    expect(loggerMocks.info).toHaveBeenCalledWith(
      'Update not yet supported for installation method: "manual" for tool "manualtool".'
    );
    expect(mockInstallerService.install).not.toHaveBeenCalled();
  });

  test('GitHub API error when fetching latest release', async () => {
    mockActualLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    (mockGitHubApiClient.getLatestRelease as any).mockRejectedValue(new Error('GitHub API Down'));

    const exitCliCallsBefore = (mockExitCli as any).mock.calls.length;
    await program.parseAsync(['update', 'fzf'], { from: 'user' });
    const exitCliCallsAfter = (mockExitCli as any).mock.calls.length;

    expect(loggerMocks.error).toHaveBeenCalledWith(
      'Error fetching latest release for fzf from junegunn/fzf: GitHub API Down'
    );
    expect(mockInstallerService.install).not.toHaveBeenCalled();
    expect(exitCliCallsAfter).toBe(exitCliCallsBefore);
  });

  test('tool configured with "latest" version', async () => {
    const fzfLatestConfig = { ...fzfToolConfig, version: 'latest' };
    mockActualLoadSingleToolConfig.mockResolvedValue(fzfLatestConfig);
    (mockGitHubApiClient.getLatestRelease as any).mockResolvedValue({
      ...latestGitHubRelease,
      tag_name: 'v0.50.0',
    });

    await program.parseAsync(['update', 'fzf'], { from: 'user' });

    expect(loggerMocks.info).toHaveBeenCalledWith(
      'Tool "fzf" is configured to \'latest\'. Current latest is 0.50.0. To install this specific version, re-install or use update with a specific version target (not yet supported).'
    );
    expect(mockInstallerService.install).not.toHaveBeenCalled();
  });
});
