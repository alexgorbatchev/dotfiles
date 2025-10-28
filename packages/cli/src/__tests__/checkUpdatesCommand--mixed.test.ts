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

describe('checkUpdatesCommand - Mixed Tool Types', () => {
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

  const lazygitToolConfig: GithubReleaseToolConfig = {
    name: 'lazygit',
    version: '0.35.0',
    installationMethod: 'github-release',
    installParams: { repo: 'jesseduffield/lazygit' },
    binaries: ['lazygit'],
  };

  beforeEach(async () => {
    // Create a configService mock that we can control
    mockConfigService = {
      loadSingleToolConfig: mock(async () => fzfToolConfig),
      loadToolConfigs: mock(async () => ({})),
    };

    const setup = await createCliTestSetup({
      testName: 'check-updates-mixed',
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

  test('should check all tools: one up-to-date, one with update', async () => {
    mockConfigService.loadToolConfigs.mockResolvedValue({
      fzf: fzfToolConfig,
      lazygit: lazygitToolConfig,
    });
    mockGitHubApiClient.getLatestRelease
      .mockResolvedValueOnce(createMockRelease('v0.40.0')) // fzf (up to date)
      .mockResolvedValueOnce(createMockRelease('v0.36.0')); // lazygit (update available)
    mockVersionChecker.checkVersionStatus
      .mockResolvedValueOnce(VersionComparisonStatus.UP_TO_DATE)
      .mockResolvedValueOnce(VersionComparisonStatus.NEWER_AVAILABLE);

    await program.parseAsync(['check-updates'], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['registerCheckUpdatesCommand'],
      [messages.toolUpToDate('fzf', '0.40.0', '0.40.0'), messages.toolUpdateAvailable('lazygit', '0.35.0', '0.36.0')]
    );
  });
});
