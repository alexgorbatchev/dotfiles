import type { GlobalProgram } from '@cli';
import { createProgram } from '@cli';
import type { YamlConfig } from '@modules/config';
import {
  loadSingleToolConfig as actualLoadSingleToolConfig,
  loadToolConfigsFromDirectory as actualLoadToolConfigsFromDirectory,
} from '@modules/config-loader';
import type { IGitHubApiClient } from '@modules/github-client';
import { logs } from '@modules/logger';
import type { IVersionChecker } from '@modules/version-checker';
import { VersionComparisonStatus } from '@modules/version-checker';
import { clearMockRegistry, createModuleMocker, setupTestCleanup } from '@rageltd/bun-test-utils';
import { TestLogger, createMemFileSystem, createMockYamlConfig, createTestDirectories, type TestDirectories } from '@testing-helpers';
import type { GitHubRelease, GithubReleaseToolConfig, ToolConfig } from '@types';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import path from 'node:path';
import { registerCheckUpdatesCommand } from '../checkUpdatesCommand';

// Set up test cleanup
setupTestCleanup();

// Create module mocker
const mockModules = createModuleMocker();

let mockYamlConfig: YamlConfig;

const mockLoadSingleToolConfig = mock(actualLoadSingleToolConfig);
const mockLoadToolConfigsFromDirectory = mock(actualLoadToolConfigsFromDirectory);
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
  let mockGitHubApiClient: Partial<IGitHubApiClient>;
  let mockVersionChecker: Partial<IVersionChecker>;

  beforeEach(async () => {
    mock.restore();
    program = createProgram();
    logger = new TestLogger();

    // Set up mocks
    await mockModules.mock('@modules/config-loader', () => ({
      loadToolConfigsFromDirectory: mockLoadToolConfigsFromDirectory,
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

    const mockServices = {
      yamlConfig: mockYamlConfig,
      fs: mockFs.fs.asIFileSystem,
      versionChecker: mockVersionChecker as IVersionChecker,
      githubApiClient: mockGitHubApiClient as IGitHubApiClient,
    };

    registerCheckUpdatesCommand(logger, program, async () => mockServices as any);
  });

  afterEach(() => {
    clearMockRegistry();
  });

  afterAll(() => {
    mockModules.restoreAll();
  });

  test('should report a tool is up-to-date', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    (mockGitHubApiClient.getLatestRelease as any).mockResolvedValue({
      tag_name: 'v0.40.0',
    });
    (mockVersionChecker.checkVersionStatus as any).mockResolvedValue(
      VersionComparisonStatus.UP_TO_DATE,
    );

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    logger.expect(['INFO'], ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'], [
      'updates for fzf',
      'fzf (0.40.0) is up to date. Latest: 0.40.0',
      'Check-updates command completed',
    ]);
  });

  test('should report an update is available', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    (mockGitHubApiClient.getLatestRelease as any).mockResolvedValue({
      tag_name: 'v0.41.0',
    });

    (mockVersionChecker.checkVersionStatus as any).mockResolvedValue(
      VersionComparisonStatus.NEWER_AVAILABLE,
    );

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    logger.expect(['INFO'], ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'], [
      'updates for fzf',
      'Update available for fzf: 0.40.0 -> 0.41.0',
      'Check-updates command completed',
    ]);
  });

  test('should check all tools: one up-to-date, one with update', async () => {
    mockLoadToolConfigsFromDirectory.mockResolvedValue({
      fzf: fzfToolConfig,
      lazygit: lazygitToolConfig,
    });

    (mockGitHubApiClient.getLatestRelease as any)
      .mockResolvedValueOnce({ tag_name: 'v0.40.0' })
      .mockResolvedValueOnce({ tag_name: 'v0.36.0' });

    (mockVersionChecker.checkVersionStatus as any)
      .mockResolvedValueOnce(VersionComparisonStatus.UP_TO_DATE)
      .mockResolvedValueOnce(VersionComparisonStatus.NEWER_AVAILABLE);

    await program.parseAsync(['check-updates'], { from: 'user' });

    logger.expect(['INFO'], ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'], [
      'updates for fzf',
      'fzf (0.40.0) is up to date. Latest: 0.40.0',
      'updates for lazygit',
      'Update available for lazygit: 0.35.0 -> 0.36.0',
      'Check-updates command completed',
    ]);
  });

  test('should handle tool configured with "latest" version', async () => {
    const fzfLatestConfig: GithubReleaseToolConfig = { ...fzfToolConfig, version: 'latest' };
    mockLoadSingleToolConfig.mockResolvedValue(fzfLatestConfig);
    (mockGitHubApiClient.getLatestRelease as any).mockResolvedValue({
      tag_name: 'v0.42.0',
    });

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    logger.expect(['INFO'], ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'], [
      'updates for fzf',
      'Tool "fzf" is configured to \'latest\'. The latest available version is 0.42.0',
      'Check-updates command completed',
    ]);
  });

  test('should report unsupported installation method', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(manualToolConfig);
    await program.parseAsync(['check-updates', 'manualtool'], { from: 'user' });

    logger.expect(['*'], ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'], [
      'check-updates command action logic started. Tool: manualtool',
      'updates for manualtool',
      'Update checking for manualtool not yet supported (method: manual)',
      'Check-updates command completed',
    ]);
  });

  test('should handle GitHub API error gracefully', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    (mockGitHubApiClient.getLatestRelease as any).mockRejectedValue(
      new Error('GitHub API unavailable'),
    );

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    logger.expect(['INFO', 'ERROR', 'INFO'], ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'], [
      'updates for fzf',
      logs.service.error.github.apiFailed('get latest release', 0, 'GitHub API unavailable'),
      'Check-updates command completed',
    ]);
  });

  test('should handle tool config not found for specific tool', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(undefined);
    // The action handler calls exitCli, which is mocked to throw in tests
    expect(
      program.parseAsync(['check-updates', 'nonexistenttool'], { from: 'user' }),
    ).rejects.toThrow();

    logger.expect(
      ['ERROR'],
      ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'],
      [
        logs.tool.error.notFound('nonexistenttool', mockYamlConfig.paths.toolConfigsDir),
      ],
    );
  });

  test('should handle no tool configurations found when checking all', async () => {
    mockLoadToolConfigsFromDirectory.mockResolvedValue({});
    await program.parseAsync(['check-updates'], { from: 'user' });
    logger.expect(
      ['INFO'],
      ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'],
      [`No tool configurations found in ${mockYamlConfig.paths.toolConfigsDir}`],
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

    logger.expect(['INFO', 'WARN', 'INFO'], ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'], [
      'updates for invalidrepo',
      logs.config.warning.invalid('repo format', 'justonename', 'owner/repo'),
      'Check-updates command completed',
    ]);
  });

  test('should handle missing repo in github-release tool config', async () => {
    const missingRepoConfig = {
      ...fzfToolConfig,
      name: 'missingrepo',
      installParams: {},
    } as GithubReleaseToolConfig;
    mockLoadSingleToolConfig.mockResolvedValue(missingRepoConfig);

    await program.parseAsync(['check-updates', 'missingrepo'], { from: 'user' });

    logger.expect(['INFO', 'WARN', 'INFO'], ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'], [
      'updates for missingrepo',
      logs.config.warning.ignored('repo', 'Tool "missingrepo" is \'github-release\' but missing \'repo\' parameter'),
      'Check-updates command completed',
    ]);
  });

  test('should handle error during loadToolConfigsFromDirectory', async () => {
    const errorMessage = 'FS read error';
    mockLoadToolConfigsFromDirectory.mockRejectedValue(new Error(errorMessage));
    expect(program.parseAsync(['check-updates'], { from: 'user' })).rejects.toThrow();
    logger.expect(
      ['ERROR'],
      ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'],
      [logs.config.error.loadFailed('tool configurations', errorMessage)],
    );
  });

  test('should handle error during loadSingleToolConfig', async () => {
    const errorMessage = 'FS read error single';
    mockLoadSingleToolConfig.mockRejectedValue(new Error(errorMessage));
    expect(
      program.parseAsync(['check-updates', 'sometool'], { from: 'user' }),
    ).rejects.toThrow();
    logger.expect(
      ['ERROR'],
      ['registerCheckUpdatesCommand', 'checkUpdatesActionLogic'],
      [logs.config.error.loadFailed('tool configurations', errorMessage)],
    );
  });
});
