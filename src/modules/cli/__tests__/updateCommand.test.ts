import type { GlobalProgram } from '@cli';
import type { YamlConfig } from '@modules/config';
import {
  loadSingleToolConfig,
} from '@modules/config-loader';
import type { IGitHubApiClient } from '@modules/github-client';
import type { IInstaller, InstallResult } from '@modules/installer';
import { logs } from '@modules/logger';
import { VersionComparisonStatus, type IVersionChecker } from '@modules/version-checker';
import { TestLogger } from '@testing-helpers';
import { createCliTestSetup } from './createCliTestSetup';
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
            async (toolName: string, tc: ToolConfig, _opts?: any): Promise<InstallResult> => ({
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
          getRateLimit: mock(async () => ({ remaining: 5000, limit: 5000, reset: Date.now() + 3600000, used: 0, resource: 'core' })),
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
      loadToolConfigsFromDirectory: mockLoadToolConfigsFromDirectory,
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
    (mockGitHubApiClient.getLatestRelease as any).mockResolvedValue({
      ...latestGitHubRelease,
      tag_name: 'v0.40.0',
    });
    (mockVersionChecker.checkVersionStatus as any).mockResolvedValue(
      VersionComparisonStatus.UP_TO_DATE
    );

    await program.parseAsync(['update', 'fzf'], { from: 'user' });

    logger.expect(['INFO'], ['updateCommand'], [
      'updates check for "fzf"',
      'fzf (0.40.0) is up to date. Latest: 0.40.0',
    ]);
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

    logger.expect(['INFO'], ['updateCommand'], [
      'updates check for "fzf"',
      'Update available for fzf: 0.40.0 -> 0.41.0',
      'fzf update from 0.40.0 to 0.41.0',
      'Tool "fzf" updated from v0.40.0 to v0.41.0',
    ]);
    expect(mockInstallerService.install).toHaveBeenCalledWith(
      'fzf',
      expect.objectContaining({ name: 'fzf', version: '0.41.0' }),
      { force: true }
    );
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

    expect(program.parseAsync(['update', 'fzf'], { from: 'user' })).rejects.toThrow(
      'MOCK_EXIT_CLI_CALLED_WITH_1'
    );

    logger.expect(['ERROR'], ['updateCommand'], [
      logs.tool.error.updateFailed('fzf', 'Install failed miserably'),
    ]);
  });

  test('tool config not found', async () => {
    mockActualLoadSingleToolConfig.mockResolvedValue(undefined);

    expect(program.parseAsync(['update', 'nonexistent'], { from: 'user' })).rejects.toThrow(
      'MOCK_EXIT_CLI_CALLED_WITH_1'
    );

    logger.expect(['ERROR'], ['updateCommand'], [
      logs.tool.error.notFound('nonexistent', mockYamlConfig.paths.toolConfigsDir),
    ]);
  });

  test('unsupported installation method', async () => {
    mockActualLoadSingleToolConfig.mockResolvedValue(manualToolConfig);

    await program.parseAsync(['update', 'manualtool'], { from: 'user' });

    logger.expect(['INFO'], ['updateCommand'], [
      'updates check for "manualtool"',
      'Update not yet supported (installation method: "manual" for tool "manualtool")',
    ]);
    expect(mockInstallerService.install).not.toHaveBeenCalled();
  });

  test('GitHub API error when fetching latest release', async () => {
    mockActualLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    (mockGitHubApiClient.getLatestRelease as any).mockRejectedValue(new Error('GitHub API Down'));

    await program.parseAsync(['update', 'fzf'], { from: 'user' });

    logger.expect(['ERROR'], ['updateCommand'], [
      logs.service.error.github.apiFailed('get latest release', 0, 'GitHub API Down'),
    ]);
    expect(mockInstallerService.install).not.toHaveBeenCalled();
  });

  test('tool configured with "latest" version', async () => {
    const fzfLatestConfig = { ...fzfToolConfig, version: 'latest' };
    mockActualLoadSingleToolConfig.mockResolvedValue(fzfLatestConfig);
    (mockGitHubApiClient.getLatestRelease as any).mockResolvedValue({
      ...latestGitHubRelease,
      tag_name: 'v0.50.0',
    });

    await program.parseAsync(['update', 'fzf'], { from: 'user' });

    logger.expect(['INFO'], ['updateCommand'], [
      'updates check for "fzf"',
      'Tool "fzf" is configured to \'latest\'. The latest available version is 0.50.0',
    ]);
    expect(mockInstallerService.install).not.toHaveBeenCalled();
  });

  describe('shim mode', () => {
    test('should use concise output when --shim-mode flag is provided', async () => {
      mockActualLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
      (mockGitHubApiClient.getLatestRelease as any).mockResolvedValue(latestGitHubRelease);
      (mockVersionChecker.checkVersionStatus as any).mockResolvedValue(VersionComparisonStatus.NEWER_AVAILABLE);
      (mockInstallerService.install as any).mockResolvedValue({ success: true });

      await program.parseAsync(['update', 'fzf', '--shim-mode'], { from: 'user' });

      // Should use concise shim-mode output instead of verbose template messages
      logger.expect(['INFO'], ['updateCommand'], [
        'Updating fzf from 0.40.0 to 0.41.0...',
        'fzf successfully updated to 0.41.0',
      ]);
    });

    test('should show concise message when tool is already latest in shim mode', async () => {
      const fzfLatestConfig = { ...fzfToolConfig, version: 'latest' };
      mockActualLoadSingleToolConfig.mockResolvedValue(fzfLatestConfig);
      (mockGitHubApiClient.getLatestRelease as any).mockResolvedValue({
        ...latestGitHubRelease,
        tag_name: 'v0.41.0',
      });

      await program.parseAsync(['update', 'fzf', '--shim-mode'], { from: 'user' });

      // Should use concise shim-mode output
      logger.expect(['INFO'], ['updateCommand'], [
        'fzf is already on latest version (0.41.0)',
      ]);
      expect(mockInstallerService.install).not.toHaveBeenCalled();
    });

    test('should show concise message when tool is already up to date in shim mode', async () => {
      mockActualLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
      (mockGitHubApiClient.getLatestRelease as any).mockResolvedValue({
        ...latestGitHubRelease,
        tag_name: 'v0.40.0', // Same as configured version
      });
      (mockVersionChecker.checkVersionStatus as any).mockResolvedValue(VersionComparisonStatus.UP_TO_DATE);

      await program.parseAsync(['update', 'fzf', '--shim-mode'], { from: 'user' });

      // Should use concise shim-mode output
      logger.expect(['INFO'], ['updateCommand'], [
        'fzf is already up to date (0.40.0)',
      ]);
      expect(mockInstallerService.install).not.toHaveBeenCalled();
    });

    test('should skip "checking updates" message in shim mode', async () => {
      mockActualLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
      (mockGitHubApiClient.getLatestRelease as any).mockResolvedValue({
        ...latestGitHubRelease,
        tag_name: 'v0.40.0',
      });
      (mockVersionChecker.checkVersionStatus as any).mockResolvedValue(VersionComparisonStatus.UP_TO_DATE);

      await program.parseAsync(['update', 'fzf', '--shim-mode'], { from: 'user' });

      // Should not include the "checking updates" message in shim mode
      logger.expect(['INFO'], ['updateCommand'], [
        'fzf is already up to date (0.40.0)',
      ]);
      // Ensure no "Checking for updates" message appears  
      // Check that no log message contains "updates check for"
      const logsContainCheckingMessage = logger.logs.some((log: any) => 
        log['message'] && typeof log['message'] === 'string' && log['message'].includes('updates check for')
      );
      expect(logsContainCheckingMessage).toBe(false);
    });
  });
});
