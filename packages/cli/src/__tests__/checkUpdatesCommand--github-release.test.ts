import { beforeEach, describe, mock, test } from 'bun:test';
import type { IConfigService } from '@dotfiles/config';
import type { IGitHubApiClient } from '@dotfiles/installer/clients/github';
import type { TestLogger } from '@dotfiles/logger';
import type { GitHubRelease, GithubReleaseToolConfig } from '@dotfiles/schemas';
import type { MockedInterface } from '@dotfiles/testing-helpers';
import type { IVersionChecker } from '@dotfiles/version-checker';
import { VersionComparisonStatus } from '@dotfiles/version-checker';
import { registerCheckUpdatesCommand } from '../checkUpdatesCommand';
import { messages } from '../log-messages';
import type { GlobalProgram } from '../types';
import { createCliTestSetup } from './createCliTestSetup';

// Helper function to create mock GitHubRelease objects
function createMockRelease(tagName: string, id = 123): GitHubRelease {
  const result: GitHubRelease = {
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
  return result;
}

describe('checkUpdatesCommand - GitHub Release Updates', () => {
  let program: GlobalProgram;
  let mockGitHubApiClient: MockedInterface<IGitHubApiClient>;
  let mockVersionChecker: MockedInterface<IVersionChecker>;
  let logger: TestLogger;
  let mockConfigService: MockedInterface<IConfigService>;

  const fzfToolConfig: GithubReleaseToolConfig = {
    name: 'fzf',
    version: '0.40.0',
    installationMethod: 'github-release',
    installParams: { repo: 'junegunn/fzf' },
    binaries: ['fzf'],
  };

  beforeEach(async () => {
    // Create a configService mock that we can control
    mockConfigService = {
      loadSingleToolConfig: mock(async () => fzfToolConfig),
      loadToolConfigs: mock(async () => ({})),
    };

    const setup = await createCliTestSetup({
      testName: 'check-updates-github-release',
      memFileSystem: { exists: mock(async () => true) },
      services: {
        configService: mockConfigService,
        githubApiClient: {
          getLatestRelease: mock(async () => createMockRelease('v0.41.0')),
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

    // Extract the mocks for individual test manipulation
    mockGitHubApiClient = setup.mockServices.githubApiClient!;
    mockVersionChecker = setup.mockServices.versionChecker!;

    registerCheckUpdatesCommand(logger, program, async () => setup.createServices());
  });

  test('should report a tool is up-to-date', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    mockGitHubApiClient.getLatestRelease.mockResolvedValue(createMockRelease('v0.40.0'));
    mockVersionChecker.checkVersionStatus.mockResolvedValue(VersionComparisonStatus.UP_TO_DATE);

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    logger.expect(['INFO'], ['registerCheckUpdatesCommand'], [messages.toolUpToDate('fzf', '0.40.0', '0.40.0')]);
  });

  test('should report an update is available', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    mockGitHubApiClient.getLatestRelease.mockResolvedValue(createMockRelease('v0.41.0'));
    mockVersionChecker.checkVersionStatus.mockResolvedValue(VersionComparisonStatus.NEWER_AVAILABLE);

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    logger.expect(['INFO'], ['registerCheckUpdatesCommand'], [messages.toolUpdateAvailable('fzf', '0.40.0', '0.41.0')]);
  });

  test('should handle tool configured with "latest" version', async () => {
    const fzfLatestConfig: GithubReleaseToolConfig = { ...fzfToolConfig, version: 'latest' };
    mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfLatestConfig);
    mockGitHubApiClient.getLatestRelease.mockResolvedValue(createMockRelease('v0.42.0'));

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    logger.expect(['INFO'], ['registerCheckUpdatesCommand'], [messages.toolConfiguredToLatest('fzf', '0.42.0')]);
  });

  test('should handle GitHub API error gracefully', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    mockGitHubApiClient.getLatestRelease.mockRejectedValue(new Error('GitHub API Down'));

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    logger.expect(
      ['ERROR'],
      ['registerCheckUpdatesCommand'],
      [messages.serviceGithubApiFailed('get latest release', 0)]
    );
  });

  test('should handle invalid repo format in tool config', async () => {
    const invalidRepoConfig: GithubReleaseToolConfig = {
      ...fzfToolConfig,
      installParams: { repo: 'invalid-repo-format' },
    };
    mockConfigService.loadSingleToolConfig.mockResolvedValue(invalidRepoConfig);

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    logger.expect(
      ['ERROR'],
      ['registerCheckUpdatesCommand'],
      [messages.configParameterInvalid('repo', 'invalid-repo-format', 'owner/repo format')]
    );
  });

  test('should handle missing repo in github-release tool config', async () => {
    const missingRepoConfig = {
      ...fzfToolConfig,
      installParams: {},
    } as GithubReleaseToolConfig;
    mockConfigService.loadSingleToolConfig.mockResolvedValue(missingRepoConfig);

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    logger.expect(
      ['ERROR'],
      ['registerCheckUpdatesCommand'],
      [messages.configParameterInvalid('repo', 'undefined', 'owner/repo format')]
    );
  });
});