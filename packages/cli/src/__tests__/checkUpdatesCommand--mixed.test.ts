import type { IConfigService } from '@dotfiles/config';
import type { IInstallerPlugin, InstallerPluginRegistry, UpdateCheckResult } from '@dotfiles/core';
import type { GithubReleaseToolConfig } from '@dotfiles/installer-github';
import type { TestLogger } from '@dotfiles/logger';
import type { MockedInterface } from '@dotfiles/testing-helpers';
import { VersionComparisonStatus } from '@dotfiles/version-checker';
import { beforeEach, describe, mock, test } from 'bun:test';
import { registerCheckUpdatesCommand } from '../checkUpdatesCommand';
import { messages } from '../log-messages';
import type { IGlobalProgram } from '../types';
import { createCliTestSetup } from './createCliTestSetup';

describe('checkUpdatesCommand - Mixed Tool Types', () => {
  let program: IGlobalProgram;
  let mockPlugin: MockedInterface<Partial<IInstallerPlugin>>;
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
      loadToolConfigByBinary: mock(async () => undefined),
    };

    // Create mock plugin that implements checkUpdate capability
    mockPlugin = {
      supportsUpdateCheck: mock(() => true),
      checkUpdate: mock(
        async (): Promise<UpdateCheckResult> => ({
          success: true,
          hasUpdate: false,
          currentVersion: '0.40.0',
          latestVersion: '0.40.0',
        }),
      ),
    };

    const mockPluginRegistry: Partial<MockedInterface<InstallerPluginRegistry>> = {
      get: mock((method: string) => (method === 'github-release' ? (mockPlugin as IInstallerPlugin) : undefined)),
      register: mock(() => Promise.resolve()),
      getAll: mock(() => []),
    };

    const setup = await createCliTestSetup({
      testName: 'check-updates-mixed',
      memFileSystem: { exists: mock(async () => true) },
      services: {
        configService: mockConfigService,
        pluginRegistry: mockPluginRegistry as MockedInterface<InstallerPluginRegistry>,
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

  test('should check all tools: one up-to-date, one with update', async () => {
    mockConfigService.loadToolConfigs.mockResolvedValue({
      fzf: fzfToolConfig,
      lazygit: lazygitToolConfig,
    });

    (mockPlugin.checkUpdate as ReturnType<typeof mock>)
      .mockResolvedValueOnce({
        success: true,
        hasUpdate: false,
        currentVersion: '0.40.0',
        latestVersion: '0.40.0',
      })
      .mockResolvedValueOnce({
        success: true,
        hasUpdate: true,
        currentVersion: '0.35.0',
        latestVersion: '0.36.0',
      });

    await program.parseAsync(['check-updates'], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['registerCheckUpdatesCommand'],
      [],
      [messages.toolUpToDate('fzf', '0.40.0', '0.40.0'), messages.toolUpdateAvailable('lazygit', '0.35.0', '0.36.0')],
    );
  });
});
