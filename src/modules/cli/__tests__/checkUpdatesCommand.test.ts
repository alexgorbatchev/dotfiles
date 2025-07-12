import type { GlobalProgram, Services } from '@cli';
import { createProgram } from '@cli';
import type { YamlConfig } from '@modules/config';
import {
  loadSingleToolConfig as actualLoadSingleToolConfig,
  loadToolConfigsFromDirectory as actualLoadToolConfigsFromDirectory,
  createYamlConfigFromObject,
  getDefaultConfigPath,
} from '@modules/config-loader';
import { MOCK_DEFAULT_CONFIG } from '@modules/config-loader/__tests__/fixtures';
import type { IGitHubApiClient } from '@modules/github-client';
import { createClientLogger as actualCreateClientLogger } from '@modules/logger';
import type { IVersionChecker } from '@modules/version-checker';
import { VersionComparisonStatus } from '@modules/version-checker';
import { createMemFileSystem, createMockClientLogger, type LoggerMocks } from '@testing-helpers';
import type { GitHubRelease, GithubReleaseToolConfig, ToolConfig } from '@types';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { registerCheckUpdatesCommand } from '../checkUpdatesCommand';
import { clearMockRegistry, createModuleMocker, setupTestCleanup } from '@rageltd/bun-test-utils';

// Set up test cleanup
setupTestCleanup();

// Create module mocker
const mockModules = createModuleMocker();

let mockYamlConfig: YamlConfig;

const mockLoadSingleToolConfig = mock(actualLoadSingleToolConfig);
const mockLoadToolConfigsFromDirectory = mock(actualLoadToolConfigsFromDirectory);
const mockCreateClientLogger = mock(actualCreateClientLogger);
const mockGetDefaultConfigPath = mock(() => '/test/default-config.yaml');
const mockCreateLogger = mock(() => mock(() => {}));

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
  let mockServices: Services;
  let loggerMocks: LoggerMocks;

  beforeEach(async () => {
    mock.restore();
    program = createProgram();

    // Set up mocks
    await mockModules.mock('@modules/config-loader', () => ({
      loadToolConfigsFromDirectory: mockLoadToolConfigsFromDirectory,
      loadSingleToolConfig: mockLoadSingleToolConfig,
      createYamlConfigFromObject,
      getDefaultConfigPath: mockGetDefaultConfigPath,
    }));

    await mockModules.mock('@modules/logger', () => ({
      createClientLogger: mockCreateClientLogger,
      createLogger: mockCreateLogger,
    }));

    const mockFs = await createMemFileSystem({
      initialVolumeJson: {
        [getDefaultConfigPath()]: MOCK_DEFAULT_CONFIG,
      },
    });

    mockYamlConfig = await createYamlConfigFromObject(mockFs.fs);

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
        })
      ),
    };

    const { mockClientLogger, loggerMocks: lm } = createMockClientLogger();
    loggerMocks = lm;

    mockCreateClientLogger.mockReturnValue(mockClientLogger);

    mockServices = {
      yamlConfig: mockYamlConfig,
      fs: mockFs.fs.asIFileSystem,
      versionChecker: mockVersionChecker as IVersionChecker,
      githubApiClient: mockGitHubApiClient as IGitHubApiClient,
    } as Services;

    registerCheckUpdatesCommand(program, mockServices);
  });

  test('should report a tool is up-to-date', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    (mockServices.githubApiClient.getLatestRelease as any).mockResolvedValue({
      tag_name: 'v0.40.0',
    });
    (mockServices.versionChecker.checkVersionStatus as any).mockResolvedValue(
      VersionComparisonStatus.UP_TO_DATE
    );

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    expect(loggerMocks.info).toHaveBeenCalledWith('Check-updates command finished.');
    expect(loggerMocks.log).toHaveBeenCalledWith('fzf (0.40.0) is up to date. Latest: 0.40.0');
  });

  afterEach(() => {
    clearMockRegistry();
  });

  afterAll(() => {
    mockModules.restoreAll();
  });

  test('should report an update is available', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    (mockServices.githubApiClient.getLatestRelease as any).mockResolvedValue({
      tag_name: 'v0.41.0',
    });
    
    (mockServices.versionChecker.checkVersionStatus as any).mockResolvedValue(
      VersionComparisonStatus.NEWER_AVAILABLE
    );

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    expect(loggerMocks.log).toHaveBeenCalledWith('Update available for fzf: 0.40.0 -> 0.41.0');
  });

  test('should check all tools: one up-to-date, one with update', async () => {
    mockLoadToolConfigsFromDirectory.mockResolvedValue({
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
    mockLoadSingleToolConfig.mockResolvedValue(fzfLatestConfig);
    (mockServices.githubApiClient.getLatestRelease as any).mockResolvedValue({
      tag_name: 'v0.42.0',
    });

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    expect(loggerMocks.log).toHaveBeenCalledWith(
      'Tool "fzf" is configured to \'latest\'. The latest available version is 0.42.0.'
    );
  });

  test('should report unsupported installation method', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(manualToolConfig);
    await program.parseAsync(['check-updates', 'manualtool'], { from: 'user' });

    expect(loggerMocks.log).toHaveBeenCalledWith(
      'Update checking not yet supported for manualtool (method: manual)'
    );
  });

  test('should handle GitHub API error gracefully', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    (mockServices.githubApiClient.getLatestRelease as any).mockRejectedValue(
      new Error('GitHub API unavailable')
    );

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    expect(loggerMocks.error).toHaveBeenCalledWith(
      'Error checking GitHub updates for fzf: GitHub API unavailable'
    );
  });

  test('should handle tool config not found for specific tool', async () => {
    mockLoadSingleToolConfig.mockResolvedValue(undefined);
    // The action handler calls exitCli, which is mocked to throw in tests
    expect(
      program.parseAsync(['check-updates', 'nonexistenttool'], { from: 'user' })
    ).rejects.toThrow();
    expect(loggerMocks.error).toHaveBeenCalledWith(
      `Tool configuration for "nonexistenttool" not found in ${mockYamlConfig.paths.toolConfigsDir}.`
    );
  });

  test('should handle no tool configurations found when checking all', async () => {
    mockLoadToolConfigsFromDirectory.mockResolvedValue({});
    await program.parseAsync(['check-updates'], { from: 'user' });
    expect(loggerMocks.info).toHaveBeenCalledWith(
      `No tool configurations found in ${mockYamlConfig.paths.toolConfigsDir}.`
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

    expect(loggerMocks.warn).toHaveBeenCalledWith(
      "Invalid 'repo' format for \"invalidrepo\": justonename. Expected 'owner/repo'. Skipping."
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

    expect(loggerMocks.warn).toHaveBeenCalledWith(
      "Tool \"missingrepo\" is 'github-release' but missing 'repo' in installParams. Skipping."
    );
  });

  test('should handle error during loadToolConfigsFromDirectory', async () => {
    const errorMessage = 'FS read error';
    mockLoadToolConfigsFromDirectory.mockRejectedValue(new Error(errorMessage));
    expect(program.parseAsync(['check-updates'], { from: 'user' })).rejects.toThrow();
    expect(loggerMocks.error).toHaveBeenCalledWith(
      'Error loading tool configurations: %s',
      errorMessage
    );
  });

  test('should handle error during loadSingleToolConfig', async () => {
    const errorMessage = 'FS read error single';
    mockLoadSingleToolConfig.mockRejectedValue(new Error(errorMessage));
    expect(
      program.parseAsync(['check-updates', 'sometool'], { from: 'user' })
    ).rejects.toThrow();
    expect(loggerMocks.error).toHaveBeenCalledWith(
      'Error loading tool configurations: %s',
      errorMessage
    );
  });
});
