import { beforeEach, describe, mock, test } from 'bun:test';
import type { IConfigService } from '@dotfiles/config';
import type { InstallerPlugin, UpdateCheckResult } from '@dotfiles/core';
import type { GithubReleaseToolConfig } from '@dotfiles/installer-github';
import type { TestLogger } from '@dotfiles/logger';
import type { MockedInterface } from '@dotfiles/testing-helpers';
import { VersionComparisonStatus } from '@dotfiles/version-checker';
import { registerCheckUpdatesCommand } from '../checkUpdatesCommand';
import { messages } from '../log-messages';
import type { GlobalProgram } from '../types';
import { createCliTestSetup } from './createCliTestSetup';

describe('checkUpdatesCommand - GitHub Release Updates', () => {
  let program: GlobalProgram;
  let mockPlugin: Partial<InstallerPlugin>;
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

    // Create mock plugin that implements checkUpdate capability
    mockPlugin = {
      supportsUpdateCheck: mock(() => true),
      checkUpdate: mock(
        async (): Promise<UpdateCheckResult> => ({
          hasUpdate: true,
          currentVersion: '0.40.0',
          latestVersion: '0.41.0',
        })
      ),
    };

    const setup = await createCliTestSetup({
      testName: 'check-updates-github-release',
      memFileSystem: { exists: mock(async () => true) },
      services: {
        configService: mockConfigService,
        // biome-ignore lint/suspicious/noExplicitAny: Test mock bypasses strict typing
        pluginRegistry: {
          get: mock((method: string) => (method === 'github-release' ? (mockPlugin as InstallerPlugin) : undefined)),
          register: mock(() => Promise.resolve()),
          getAll: mock(() => []),
        } as any,
        versionChecker: {
          checkVersionStatus: mock(async () => VersionComparisonStatus.UP_TO_DATE),
          getLatestToolVersion: mock(async () => '0.40.0'),
        },
      },
    });

    program = setup.program;
    logger = setup.logger;

    registerCheckUpdatesCommand(logger, program, async () => setup.createServices());
  });

  test('should report a tool is up-to-date', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    (mockPlugin.checkUpdate as ReturnType<typeof mock>).mockResolvedValue({
      hasUpdate: false,
      currentVersion: '0.40.0',
      latestVersion: '0.40.0',
    });

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    logger.expect(['INFO'], ['registerCheckUpdatesCommand'], [messages.toolUpToDate('fzf', '0.40.0', '0.40.0')]);
  });

  test('should report an update is available', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    (mockPlugin.checkUpdate as ReturnType<typeof mock>).mockResolvedValue({
      hasUpdate: true,
      currentVersion: '0.40.0',
      latestVersion: '0.41.0',
    });

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    logger.expect(['INFO'], ['registerCheckUpdatesCommand'], [messages.toolUpdateAvailable('fzf', '0.40.0', '0.41.0')]);
  });

  test('should handle tool configured with "latest" version', async () => {
    const fzfLatestConfig: GithubReleaseToolConfig = { ...fzfToolConfig, version: 'latest' };
    mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfLatestConfig);
    (mockPlugin.checkUpdate as ReturnType<typeof mock>).mockResolvedValue({
      hasUpdate: false,
      currentVersion: 'latest',
      latestVersion: '0.42.0',
    });

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    logger.expect(['INFO'], ['registerCheckUpdatesCommand'], [messages.toolConfiguredToLatest('fzf', '0.42.0')]);
  });

  test('should handle GitHub API error gracefully', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(fzfToolConfig);
    (mockPlugin.checkUpdate as ReturnType<typeof mock>).mockResolvedValue({
      hasUpdate: false,
      currentVersion: '0.40.0',
      latestVersion: undefined,
      error: 'GitHub API Down',
    });

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    logger.expect(['ERROR'], ['registerCheckUpdatesCommand'], [messages.serviceGithubApiFailed('check update', 0)]);
  });

  test('should handle invalid repo format in tool config', async () => {
    const invalidRepoConfig: GithubReleaseToolConfig = {
      ...fzfToolConfig,
      installParams: { repo: 'invalid-repo-format' },
    };
    mockConfigService.loadSingleToolConfig.mockResolvedValue(invalidRepoConfig);
    (mockPlugin.checkUpdate as ReturnType<typeof mock>).mockResolvedValue({
      hasUpdate: false,
      currentVersion: '0.40.0',
      latestVersion: undefined,
      error: 'Invalid repo format: invalid-repo-format',
    });

    await program.parseAsync(['check-updates', 'fzf'], { from: 'user' });

    logger.expect(['ERROR'], ['registerCheckUpdatesCommand'], [messages.serviceGithubApiFailed('check update', 0)]);
  });
});
