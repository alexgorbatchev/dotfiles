import { beforeEach, describe, mock, test } from 'bun:test';
import type { IConfigService } from '@dotfiles/config';
import type { IInstallerPlugin, UpdateCheckResult } from '@dotfiles/core';
import type { BrewToolConfig } from '@dotfiles/installer-brew';
import type { TestLogger } from '@dotfiles/logger';
import type { MockedInterface } from '@dotfiles/testing-helpers';
import { VersionComparisonStatus } from '@dotfiles/version-checker';
import { registerCheckUpdatesCommand } from '../checkUpdatesCommand';
import { messages } from '../log-messages';
import type { IGlobalProgram } from '../types';
import { createCliTestSetup } from './createCliTestSetup';

describe('checkUpdatesCommand - Brew Updates', () => {
  let program: IGlobalProgram;
  let mockPlugin: Partial<IInstallerPlugin>;
  let logger: TestLogger;
  let mockConfigService: MockedInterface<IConfigService>;

  const brewToolConfig: BrewToolConfig = {
    name: 'ripgrep',
    version: '13.0.0',
    installationMethod: 'brew',
    installParams: { formula: 'ripgrep' },
    binaries: ['rg'],
  };

  const brewCaskToolConfig: BrewToolConfig = {
    name: 'vscode',
    version: '1.85.0',
    installationMethod: 'brew',
    installParams: { formula: 'visual-studio-code', cask: true },
    binaries: ['code'],
  };

  beforeEach(async () => {
    // Create a configService mock that we can control
    mockConfigService = {
      loadSingleToolConfig: mock(async () => brewToolConfig),
      loadToolConfigs: mock(async () => ({})),
    };

    // Create mock plugin that implements checkUpdate capability
    mockPlugin = {
      supportsUpdateCheck: mock(() => true),
      checkUpdate: mock(
        async (): Promise<UpdateCheckResult> => ({
          success: true,
          hasUpdate: false,
          currentVersion: '13.0.0',
          latestVersion: '13.0.0',
        })
      ),
    };

    const setup = await createCliTestSetup({
      testName: 'check-updates-brew',
      memFileSystem: { exists: mock(async () => true) },
      services: {
        configService: mockConfigService,
        pluginRegistry: {
          get: mock((method: string) => (method === 'brew' ? (mockPlugin as IInstallerPlugin) : undefined)),
          register: mock(() => Promise.resolve()),
          getAll: mock(() => []),
          // biome-ignore lint/suspicious/noExplicitAny: Test mock bypasses strict typing
        } as any,
        versionChecker: {
          checkVersionStatus: mock(async () => VersionComparisonStatus.UP_TO_DATE),
          getLatestToolVersion: mock(async () => '13.0.0'),
        },
      },
    });

    program = setup.program;
    logger = setup.logger;

    registerCheckUpdatesCommand(logger, program, async () => setup.createServices());
  });

  test('should report brew formula is up-to-date', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(brewToolConfig);
    (mockPlugin.checkUpdate as ReturnType<typeof mock>).mockResolvedValue({
      success: true,
      hasUpdate: false,
      currentVersion: '13.0.0',
      latestVersion: '13.0.0',
    });

    await program.parseAsync(['check-updates', 'ripgrep'], { from: 'user' });

    logger.expect(['INFO'], ['registerCheckUpdatesCommand'], [messages.toolUpToDate('ripgrep', '13.0.0', '13.0.0')]);
  });

  test('should report brew formula update available', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(brewToolConfig);
    (mockPlugin.checkUpdate as ReturnType<typeof mock>).mockResolvedValue({
      success: true,
      hasUpdate: true,
      currentVersion: '13.0.0',
      latestVersion: '14.0.0',
    });

    await program.parseAsync(['check-updates', 'ripgrep'], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['registerCheckUpdatesCommand'],
      [messages.toolUpdateAvailable('ripgrep', '13.0.0', '14.0.0')]
    );
  });

  test('should handle brew cask updates', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(brewCaskToolConfig);
    (mockPlugin.checkUpdate as ReturnType<typeof mock>).mockResolvedValue({
      success: true,
      hasUpdate: true,
      currentVersion: '1.85.0',
      latestVersion: '1.86.0',
    });

    await program.parseAsync(['check-updates', 'vscode'], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['registerCheckUpdatesCommand'],
      [messages.toolUpdateAvailable('vscode', '1.85.0', '1.86.0')]
    );
  });

  test('should handle brew tool configured with "latest" version', async () => {
    const brewLatestConfig: BrewToolConfig = { ...brewToolConfig, version: 'latest' };
    mockConfigService.loadSingleToolConfig.mockResolvedValue(brewLatestConfig);
    (mockPlugin.checkUpdate as ReturnType<typeof mock>).mockResolvedValue({
      success: true,
      hasUpdate: false,
      currentVersion: 'latest',
      latestVersion: '14.0.0',
    });

    await program.parseAsync(['check-updates', 'ripgrep'], { from: 'user' });

    logger.expect(['INFO'], ['registerCheckUpdatesCommand'], [messages.toolConfiguredToLatest('ripgrep', '14.0.0')]);
  });

  test('should handle missing formula in brew tool config', async () => {
    const missingFormulaConfig: BrewToolConfig = {
      ...brewToolConfig,
      installParams: {},
    };
    mockConfigService.loadSingleToolConfig.mockResolvedValue(missingFormulaConfig);
    (mockPlugin.checkUpdate as ReturnType<typeof mock>).mockResolvedValue({
      success: false,
      error: 'Invalid formula: undefined',
    });

    await program.parseAsync(['check-updates', 'ripgrep'], { from: 'user' });

    logger.expect(['ERROR'], ['registerCheckUpdatesCommand'], [messages.serviceGithubApiFailed('check update', 0)]);
  });

  test('should handle brew info command failure', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(brewToolConfig);
    (mockPlugin.checkUpdate as ReturnType<typeof mock>).mockResolvedValue({
      success: false,
      error: 'Brew info command failed',
    });

    await program.parseAsync(['check-updates', 'ripgrep'], { from: 'user' });

    logger.expect(['ERROR'], ['registerCheckUpdatesCommand'], [messages.serviceGithubApiFailed('check update', 0)]);
  });
});
