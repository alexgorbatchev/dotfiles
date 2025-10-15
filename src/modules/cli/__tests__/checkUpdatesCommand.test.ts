import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import path from 'node:path';
import type { GlobalProgram, Services } from '@cli';
import { createProgram } from '@cli';
import type { YamlConfig } from '@modules/config';
import {
  loadSingleToolConfig as actualLoadSingleToolConfig,
  loadToolConfigs as actualLoadToolConfigs,
} from '@modules/config-loader';
import { cliLogMessages } from '@modules/cli/log-messages';
import type { IGitHubApiClient } from '@modules/installer/clients/github';
import type { IVersionChecker } from '@modules/version-checker';
import { VersionComparisonStatus } from '@modules/version-checker';
import { clearMockRegistry, createModuleMocker, setupTestCleanup } from '@rageltd/bun-test-utils';
import {
  createMemFileSystem,
  createMockYamlConfig,
  createTestDirectories,
  type TestDirectories,
  TestLogger,
} from '@testing-helpers';
import type { GitHubRelease, GithubReleaseToolConfig, ToolConfig } from '@types';
import { registerCheckUpdatesCommand } from '../checkUpdatesCommand';

// Helper function to create mock GitHubRelease objects
function createMockRelease(tagName: string, id = 123): GitHubRelease {
  return {
    id,
    tag_name: tagName,
    name: `Release ${tagName}`,
    draft: false,
    prerelease: false,
    created_at: new Date().toISOString(),
    published_at: new Date().toISOString(),
    assets: [],
    html_url: `https://github.com/owner/repo/releases/tag/${tagName}`,
    body: 'Release body',
  };
}

// Set up test cleanup
setupTestCleanup();

// Create module mocker
const mockModules = createModuleMocker();

let mockYamlConfig: YamlConfig;

const mockLoadSingleToolConfig = mock(actualLoadSingleToolConfig);
const mockLoadToolConfigs = mock(actualLoadToolConfigs);
const mockGetDefaultConfigPath = mock(() => '/test/default-config.yaml');

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

describe('checkUpdatesCommand', () => {
  let program: GlobalProgram;
  let logger: TestLogger;
  let testDirs: TestDirectories;
  let mockGitHubApiClient: Partial<IGitHubApiClient> & {
    getLatestRelease: ReturnType<typeof mock<IGitHubApiClient['getLatestRelease']>>;
  };
  let mockVersionChecker: Partial<IVersionChecker> & {
    checkVersionStatus: ReturnType<typeof mock<IVersionChecker['checkVersionStatus']>>;
  };

  beforeEach(async () => {
    mock.restore();
    program = createProgram();
    logger = new TestLogger();

    // Set up mocks
    await mockModules.mock('@modules/config-loader', () => ({
      loadToolConfigs: mockLoadToolConfigs,
      loadSingleToolConfig: mockLoadSingleToolConfig,
      getDefaultConfigPath: mockGetDefaultConfigPath,
    }));

    const mockFs = await createMemFileSystem({});

    testDirs = await createTestDirectories(logger, mockFs.fs, { testName: 'check-updates-command' });

    mockYamlConfig = await createMockYamlConfig({
      config: {
        paths: testDirs.paths,
      },
      filePath: path.join(testDirs.paths.dotfilesDir, 'config.yaml'),
      fileSystem: mockFs.fs,
      logger,
      systemInfo: { platform: 'linux', arch: 'x64', homeDir: testDirs.paths.homeDir },
      env: {},
    });

    mockVersionChecker = {
      checkVersionStatus: mock(async () => VersionComparisonStatus.UP_TO_DATE),
    };

    mockGitHubApiClient = {
      getLatestRelease: mock(
        async (_owner: string, _repo: string): Promise<GitHubRelease | null> => createMockRelease('1.0.0')
      ),
    };

    const mockServices: Partial<Services> = {
      yamlConfig: mockYamlConfig,
      fs: mockFs.fs.asIFileSystem,
      versionChecker: mockVersionChecker as IVersionChecker,
      githubApiClient: mockGitHubApiClient as IGitHubApiClient,
    };

    registerCheckUpdatesCommand(logger, program, async () => mockServices as Services);
  });

  afterEach(() => {
    clearMockRegistry();
  });

  afterAll(() => {
    mockModules.restoreAll();
  });

  test('should report a tool is up-to-date', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    mockGitHubApiClient.getLatestRelease.mockResolvedValue({
      id: 456,
      tag_name: 'v0.40.0',
      name: 'Release v0.40.0',
      draft: false,
      prerelease: false,
      created_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
      assets: [],
      html_url: 'https://github.com/junegunn/fzf/releases/tag/v0.40.0',
      body: 'Release body',
    });
    mockVersionChecker.checkVersionStatus.mockResolvedValue(VersionComparisonStatus.UP_TO_DATE);

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'],
      [
        cliLogMessages.toolCheckingUpdates('fzf'),
        cliLogMessages.toolUpToDate('fzf', '0.40.0', '0.40.0'),
        cliLogMessages.updatesCommandCompleted(),
      ]
    );
  });

  test('should report an update is available', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    mockGitHubApiClient.getLatestRelease.mockResolvedValue({
      id: 789,
      tag_name: 'v0.41.0',
      name: 'Release v0.41.0',
      draft: false,
      prerelease: false,
      created_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
      assets: [],
      html_url: 'https://github.com/junegunn/fzf/releases/tag/v0.41.0',
      body: 'Release body',
    });

    mockVersionChecker.checkVersionStatus.mockResolvedValue(VersionComparisonStatus.NEWER_AVAILABLE);

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'],
      [
        cliLogMessages.toolCheckingUpdates('fzf'),
        cliLogMessages.toolUpdateAvailable('fzf', '0.40.0', '0.41.0'),
        cliLogMessages.updatesCommandCompleted(),
      ]
    );
  });

  test('should check all tools: one up-to-date, one with update', async () => {
    mockLoadToolConfigs.mockResolvedValue({
      fzf: fzfToolConfig,
      lazygit: lazygitToolConfig,
    });

    (mockGitHubApiClient.getLatestRelease as ReturnType<typeof mock>)
      .mockResolvedValueOnce(createMockRelease('v0.40.0', 456))
      .mockResolvedValueOnce(createMockRelease('v0.36.0', 457));

    mockVersionChecker.checkVersionStatus
      .mockResolvedValueOnce(VersionComparisonStatus.UP_TO_DATE)
      .mockResolvedValueOnce(VersionComparisonStatus.NEWER_AVAILABLE);

    await program.parseAsync(['check-updates'], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'],
      [
        cliLogMessages.toolCheckingUpdates('fzf'),
        cliLogMessages.toolUpToDate('fzf', '0.40.0', '0.40.0'),
        cliLogMessages.toolCheckingUpdates('lazygit'),
        cliLogMessages.toolUpdateAvailable('lazygit', '0.35.0', '0.36.0'),
        cliLogMessages.updatesCommandCompleted(),
      ]
    );
  });

  test('should handle tool configured with "latest" version', async () => {
    const fzfLatestConfig: GithubReleaseToolConfig = { ...fzfToolConfig, version: 'latest' };
    mockLoadSingleToolConfig.mockResolvedValue(fzfLatestConfig);
    mockGitHubApiClient.getLatestRelease.mockResolvedValue(createMockRelease('v0.42.0', 999));

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'],
      [
        cliLogMessages.toolCheckingUpdates('fzf'),
        cliLogMessages.toolConfiguredToLatest('fzf', '0.42.0'),
        cliLogMessages.updatesCommandCompleted(),
      ]
    );
  });

  test('should report unsupported installation method', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(manualToolConfig);
    await program.parseAsync(['check-updates', 'manualtool'], { from: 'user' });

    logger.expect(
      ['*'],
      ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'],
      [
        cliLogMessages.commandActionStarted('check-updates', 'manualtool'),
        cliLogMessages.toolCheckingUpdates('manualtool'),
        cliLogMessages.commandUnsupportedOperation('Update checking for manualtool', 'method: manual'),
        cliLogMessages.updatesCommandCompleted(),
      ]
    );
  });

  test('should handle GitHub API error gracefully', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    (mockGitHubApiClient.getLatestRelease as ReturnType<typeof mock>).mockRejectedValue(
      new Error('GitHub API unavailable')
    );

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    logger.expect(
      ['INFO', 'ERROR', 'INFO'],
      ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'],
      [
        cliLogMessages.toolCheckingUpdates('fzf'),
        cliLogMessages.serviceGithubApiFailed('get latest release', 0, 'GitHub API unavailable'),
        cliLogMessages.updatesCommandCompleted(),
      ]
    );
  });

  test('should handle tool config not found for specific tool', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(undefined);
    // The action handler calls exitCli, which is mocked to throw in tests
    expect(program.parseAsync(['check-updates', 'nonexistenttool'], { from: 'user' })).rejects.toThrow();

    logger.expect(
      ['ERROR'],
      ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'],
      [cliLogMessages.toolNotFound('nonexistenttool', mockYamlConfig.paths.toolConfigsDir)]
    );
  });

  test('should handle no tool configurations found when checking all', async () => {
    mockLoadToolConfigs.mockResolvedValue({});
    await program.parseAsync(['check-updates'], { from: 'user' });
    logger.expect(
      ['INFO'],
      ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'],
      [cliLogMessages.toolNoConfigurationsFound(mockYamlConfig.paths.toolConfigsDir)]
    );
  });

  test('should handle invalid repo format in tool config', async () => {
    const invalidRepoConfig: GithubReleaseToolConfig = {
      ...fzfToolConfig,
      name: 'invalidrepo',
      installParams: { repo: 'justonename' },
    };
    mockLoadSingleToolConfig.mockResolvedValue(invalidRepoConfig);

    await program.parseAsync(['check-updates', 'invalidrepo'], { from: 'user' });

    logger.expect(
      ['INFO', 'WARN', 'INFO'],
      ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'],
      [
        cliLogMessages.toolCheckingUpdates('invalidrepo'),
        cliLogMessages.configParameterInvalid('repo format', 'justonename', 'owner/repo'),
        cliLogMessages.updatesCommandCompleted(),
      ]
    );
  });

  test('should handle missing repo in github-release tool config', async () => {
    const missingRepoConfig = {
      ...fzfToolConfig,
      name: 'missingrepo',
      installParams: {},
    } as GithubReleaseToolConfig;
    mockLoadSingleToolConfig.mockResolvedValue(missingRepoConfig);

    await program.parseAsync(['check-updates', 'missingrepo'], { from: 'user' });

    logger.expect(
      ['INFO', 'WARN', 'INFO'],
      ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'],
      [
        cliLogMessages.toolCheckingUpdates('missingrepo'),
        cliLogMessages.configParameterIgnored('repo', "Tool \"missingrepo\" is 'github-release' but missing 'repo' parameter"),
        cliLogMessages.updatesCommandCompleted(),
      ]
    );
  });

  test('should handle error during loadToolConfigs', async () => {
    const errorMessage = 'FS read error';
    mockLoadToolConfigs.mockRejectedValue(new Error(errorMessage));
    expect(program.parseAsync(['check-updates'], { from: 'user' })).rejects.toThrow();
    logger.expect(
      ['ERROR'],
      ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'],
      [cliLogMessages.configLoadFailed('tool configurations', errorMessage)]
    );
  });

  test('should handle error during loadSingleToolConfig', async () => {
    const errorMessage = 'FS read error single';
    mockLoadSingleToolConfig.mockRejectedValue(new Error(errorMessage));
    expect(program.parseAsync(['check-updates', 'sometool'], { from: 'user' })).rejects.toThrow();
    logger.expect(
      ['ERROR'],
      ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'],
      [cliLogMessages.configLoadFailed('tool configurations', errorMessage)]
    );
  });
});
