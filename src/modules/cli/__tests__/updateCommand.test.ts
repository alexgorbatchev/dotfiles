import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { GlobalProgram } from '@cli';
import type { YamlConfig } from '@modules/config';
import { loadSingleToolConfig } from '@modules/config-loader';
import type { IGitHubApiClient } from '@modules/github-client';
import type { IInstaller, InstallResult } from '@modules/installer';
import { logs } from '@modules/logger';
import { type IVersionChecker, VersionComparisonStatus } from '@modules/version-checker';
import { clearMockRegistry, createModuleMocker, setupTestCleanup } from '@rageltd/bun-test-utils';
import type { TestLogger } from '@testing-helpers';
import type { GitHubRelease, GithubReleaseToolConfig, ToolConfig } from '@types';
import { registerUpdateCommand } from '../updateCommand';
import { createCliTestSetup } from './createCliTestSetup';

// Setup cleanup once per file
setupTestCleanup();

const mockModules = createModuleMocker();

const mockActualLoadSingleToolConfig = mock(loadSingleToolConfig);
const mockLoadToolConfigsFromDirectory = mock(async () => ({}));

describe('updateCommand', () => {
  let program: GlobalProgram;
  let mockYamlConfig: YamlConfig;
  let mockGitHubApiClient: Partial<IGitHubApiClient>;
  let mockInstallerService: Partial<IInstaller>;
  let mockVersionChecker: Partial<IVersionChecker>;
  let logger: TestLogger;

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
    const setup = await createCliTestSetup({
      testName: 'update-command',
      memFileSystem: { exists: mock(async () => true) },
      services: {
        installer: {
          install: mock(
            async (toolName: string, tc: ToolConfig, _opts?: unknown): Promise<InstallResult> => ({
              success: true,
              binaryPath: `${setup.mockYamlConfig.paths.binariesDir}/${toolName}`,
              version: tc.version || 'installed-version',
            })
          ),
        },
        githubApiClient: {
          getLatestRelease: mock(
            async (_owner: string, _repo: string): Promise<GitHubRelease | null> => latestGitHubRelease
          ),
          getReleaseByTag: mock(async () => null),
          getAllReleases: mock(async () => []),
          getReleaseByConstraint: mock(async () => null),
          getRateLimit: mock(async () => ({
            remaining: 5000,
            limit: 5000,
            reset: Date.now() + 3600000,
            used: 0,
            resource: 'core',
          })),
        },
        versionChecker: {
          checkVersionStatus: mock(async () => VersionComparisonStatus.NEWER_AVAILABLE),
          getLatestToolVersion: mock(async () => '0.41.0'),
        },
      },
    });

    program = setup.program;
    logger = setup.logger;
    mockYamlConfig = setup.mockYamlConfig;

    // Extract the mocks for individual test manipulation
    mockGitHubApiClient = setup.mockServices.githubApiClient!;
    mockInstallerService = setup.mockServices.installer!;
    mockVersionChecker = setup.mockServices.versionChecker!;

    mockActualLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);

    // Set up mocks
    await mockModules.mock('@modules/config-loader/loadToolConfigs', () => ({
      loadSingleToolConfig: mockActualLoadSingleToolConfig,
      loadToolConfigs: mockLoadToolConfigsFromDirectory,
    }));

    registerUpdateCommand(logger, program, async () => setup.createServices());
  });

  afterEach(() => {
    clearMockRegistry();
  });

  afterAll(() => {
    mockModules.restoreAll();
  });

  test('tool is up-to-date', async () => {
    mockActualLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    const mockGetLatestRelease = mockGitHubApiClient.getLatestRelease as ReturnType<typeof mock>;
    mockGetLatestRelease.mockResolvedValue({
      ...latestGitHubRelease,
      tag_name: 'v0.40.0',
    });
    const mockCheckVersionStatus = mockVersionChecker.checkVersionStatus as ReturnType<typeof mock>;
    mockCheckVersionStatus.mockResolvedValue(VersionComparisonStatus.UP_TO_DATE);

    await program.parseAsync(['update', 'fzf'], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['updateCommand'],
      ['updates check for "fzf"', 'fzf (0.40.0) is up to date. Latest: 0.40.0']
    );
    expect(mockInstallerService.install).not.toHaveBeenCalled();
  });

  test('update available, successful installation', async () => {
    mockActualLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    const mockGetLatestRelease2 = mockGitHubApiClient.getLatestRelease as ReturnType<typeof mock>;
    mockGetLatestRelease2.mockResolvedValue(latestGitHubRelease);
    const mockCheckVersionStatus2 = mockVersionChecker.checkVersionStatus as ReturnType<typeof mock>;
    mockCheckVersionStatus2.mockResolvedValue(VersionComparisonStatus.NEWER_AVAILABLE);
    const mockInstall = mockInstallerService.install as ReturnType<typeof mock>;
    mockInstall.mockResolvedValue({ success: true, version: '0.41.0' });

    await program.parseAsync(['update', 'fzf'], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['updateCommand'],
      [
        'updates check for "fzf"',
        'Update available for fzf: 0.40.0 -> 0.41.0',
        'fzf update from 0.40.0 to 0.41.0',
        'Tool "fzf" updated from v0.40.0 to v0.41.0',
      ]
    );
    expect(mockInstallerService.install).toHaveBeenCalledWith(
      'fzf',
      expect.objectContaining({ name: 'fzf', version: '0.41.0' }),
      { force: true }
    );
  });

  test('update available, installation fails', async () => {
    mockActualLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    const mockGetLatestRelease3 = mockGitHubApiClient.getLatestRelease as ReturnType<typeof mock>;
    mockGetLatestRelease3.mockResolvedValue(latestGitHubRelease);
    const mockCheckVersionStatus3 = mockVersionChecker.checkVersionStatus as ReturnType<typeof mock>;
    mockCheckVersionStatus3.mockResolvedValue(VersionComparisonStatus.NEWER_AVAILABLE);
    const mockInstall2 = mockInstallerService.install as ReturnType<typeof mock>;
    mockInstall2.mockResolvedValue({
      success: false,
      error: 'Install failed miserably',
    });

    expect(program.parseAsync(['update', 'fzf'], { from: 'user' })).rejects.toThrow('MOCK_EXIT_CLI_CALLED_WITH_1');

    logger.expect(['ERROR'], ['updateCommand'], [logs.tool.error.updateFailed('fzf', 'Install failed miserably')]);
  });

  test('tool config not found', async () => {
    mockActualLoadSingleToolConfig.mockResolvedValue(undefined);

    expect(program.parseAsync(['update', 'nonexistent'], { from: 'user' })).rejects.toThrow(
      'MOCK_EXIT_CLI_CALLED_WITH_1'
    );

    logger.expect(
      ['ERROR'],
      ['updateCommand', 'action'],
      [logs.tool.error.notFound('nonexistent', mockYamlConfig.paths.toolConfigsDir)]
    );
  });

  test('unsupported installation method', async () => {
    mockActualLoadSingleToolConfig.mockResolvedValue(manualToolConfig);

    await program.parseAsync(['update', 'manualtool'], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['updateCommand'],
      [
        'updates check for "manualtool"',
        'Update not yet supported (installation method: "manual" for tool "manualtool")',
      ]
    );
    expect(mockInstallerService.install).not.toHaveBeenCalled();
  });

  test('GitHub API error when fetching latest release', async () => {
    mockActualLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    const mockGetLatestRelease4 = mockGitHubApiClient.getLatestRelease as ReturnType<typeof mock>;
    mockGetLatestRelease4.mockRejectedValue(new Error('GitHub API Down'));

    await program.parseAsync(['update', 'fzf'], { from: 'user' });

    logger.expect(
      ['ERROR'],
      ['updateCommand'],
      [logs.service.error.github.apiFailed('get latest release', 0, 'GitHub API Down')]
    );
    expect(mockInstallerService.install).not.toHaveBeenCalled();
  });

  test('tool configured with "latest" version', async () => {
    const fzfLatestConfig = { ...fzfToolConfig, version: 'latest' };
    mockActualLoadSingleToolConfig.mockResolvedValue(fzfLatestConfig);
    const mockGetLatestRelease5 = mockGitHubApiClient.getLatestRelease as ReturnType<typeof mock>;
    mockGetLatestRelease5.mockResolvedValue({
      ...latestGitHubRelease,
      tag_name: 'v0.50.0',
    });

    await program.parseAsync(['update', 'fzf'], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['updateCommand'],
      ['updates check for "fzf"', 'Tool "fzf" is configured to \'latest\'. The latest available version is 0.50.0']
    );
    expect(mockInstallerService.install).not.toHaveBeenCalled();
  });

  describe('shim mode', () => {
    test('should use concise output when --shim-mode flag is provided', async () => {
      mockActualLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
      const mockGetLatestRelease6 = mockGitHubApiClient.getLatestRelease as ReturnType<typeof mock>;
      mockGetLatestRelease6.mockResolvedValue(latestGitHubRelease);
      const mockCheckVersionStatus4 = mockVersionChecker.checkVersionStatus as ReturnType<typeof mock>;
      mockCheckVersionStatus4.mockResolvedValue(VersionComparisonStatus.NEWER_AVAILABLE);
      const mockInstall3 = mockInstallerService.install as ReturnType<typeof mock>;
      mockInstall3.mockResolvedValue({ success: true });

      await program.parseAsync(['update', 'fzf', '--shim-mode'], { from: 'user' });

      // Should use concise shim-mode output instead of verbose template messages
      logger.expect(
        ['INFO'],
        ['updateCommand'],
        ['Updating fzf from 0.40.0 to 0.41.0...', 'fzf successfully updated to 0.41.0']
      );
    });

    test('should show concise message when tool is already latest in shim mode', async () => {
      const fzfLatestConfig = { ...fzfToolConfig, version: 'latest' };
      mockActualLoadSingleToolConfig.mockResolvedValue(fzfLatestConfig);
      const mockGetLatestRelease7 = mockGitHubApiClient.getLatestRelease as ReturnType<typeof mock>;
      mockGetLatestRelease7.mockResolvedValue({
        ...latestGitHubRelease,
        tag_name: 'v0.41.0',
      });

      await program.parseAsync(['update', 'fzf', '--shim-mode'], { from: 'user' });

      // Should use concise shim-mode output
      logger.expect(['INFO'], ['updateCommand'], ['fzf is already on latest version (0.41.0)']);
      expect(mockInstallerService.install).not.toHaveBeenCalled();
    });

    test('should show concise message when tool is already up to date in shim mode', async () => {
      mockActualLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
      const mockGetLatestRelease8 = mockGitHubApiClient.getLatestRelease as ReturnType<typeof mock>;
      mockGetLatestRelease8.mockResolvedValue({
        ...latestGitHubRelease,
        tag_name: 'v0.40.0', // Same as configured version
      });
      const mockCheckVersionStatus5 = mockVersionChecker.checkVersionStatus as ReturnType<typeof mock>;
      mockCheckVersionStatus5.mockResolvedValue(VersionComparisonStatus.UP_TO_DATE);

      await program.parseAsync(['update', 'fzf', '--shim-mode'], { from: 'user' });

      // Should use concise shim-mode output
      logger.expect(['INFO'], ['updateCommand'], ['fzf is already up to date (0.40.0)']);
      expect(mockInstallerService.install).not.toHaveBeenCalled();
    });

    test('should skip "checking updates" message in shim mode', async () => {
      mockActualLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
      const mockGetLatestRelease9 = mockGitHubApiClient.getLatestRelease as ReturnType<typeof mock>;
      mockGetLatestRelease9.mockResolvedValue({
        ...latestGitHubRelease,
        tag_name: 'v0.40.0',
      });
      const mockCheckVersionStatus6 = mockVersionChecker.checkVersionStatus as ReturnType<typeof mock>;
      mockCheckVersionStatus6.mockResolvedValue(VersionComparisonStatus.UP_TO_DATE);

      await program.parseAsync(['update', 'fzf', '--shim-mode'], { from: 'user' });

      // Should not include the "checking updates" message in shim mode
      logger.expect(['INFO'], ['updateCommand'], ['fzf is already up to date (0.40.0)']);

      // Verify that exactly one log message was generated (no "updates check for" message)
      const updateCommandInfoLogs = logger.logs.filter((log) => {
        const meta = log['_meta'];
        return meta && meta.logLevelName === 'INFO' && meta.name === 'updateCommand';
      });
      expect(updateCommandInfoLogs).toHaveLength(1);
    });
  });
});
