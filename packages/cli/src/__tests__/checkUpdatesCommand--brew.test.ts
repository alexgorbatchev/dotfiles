import { beforeEach, describe, mock, test } from 'bun:test';
import type { IConfigService } from '@dotfiles/config';
import type { TestLogger } from '@dotfiles/logger';
import type { BrewToolConfig } from '@dotfiles/schemas';
import type { MockedInterface } from '@dotfiles/testing-helpers';
import type { IVersionChecker } from '@dotfiles/version-checker';
import { VersionComparisonStatus } from '@dotfiles/version-checker';
import { registerCheckUpdatesCommand } from '../checkUpdatesCommand';
import { messages } from '../log-messages';
import type { GlobalProgram } from '../types';
import { createCliTestSetup } from './createCliTestSetup';

describe('checkUpdatesCommand - Brew Updates', () => {
  let program: GlobalProgram;
  let mockVersionChecker: MockedInterface<IVersionChecker>;
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

    const setup = await createCliTestSetup({
      testName: 'check-updates-brew',
      memFileSystem: { exists: mock(async () => true) },
      services: {
        configService: mockConfigService,
        versionChecker: {
          checkVersionStatus: mock(async () => VersionComparisonStatus.NEWER_AVAILABLE),
          getLatestToolVersion: mock(async () => '14.0.0'),
        },
      },
    });

    program = setup.program;
    logger = setup.logger;

    // Extract the mocks for individual test manipulation
    mockVersionChecker = setup.mockServices.versionChecker!;

    registerCheckUpdatesCommand(logger, program, async () => setup.createServices());
  });

  test('should report brew formula is up-to-date', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(brewToolConfig);
    mockVersionChecker.checkVersionStatus.mockResolvedValue(VersionComparisonStatus.UP_TO_DATE);
    mockVersionChecker.getLatestToolVersion.mockResolvedValue('13.0.0');

    await program.parseAsync(['check-updates', 'ripgrep'], { from: 'user' });

    logger.expect(['INFO'], ['registerCheckUpdatesCommand'], [messages.toolUpToDate('ripgrep', '13.0.0', '13.0.0')]);
  });

  test('should report brew formula update available', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(brewToolConfig);
    mockVersionChecker.checkVersionStatus.mockResolvedValue(VersionComparisonStatus.NEWER_AVAILABLE);

    await program.parseAsync(['check-updates', 'ripgrep'], { from: 'user' });

    logger.expect(
      ['INFO'],
      ['registerCheckUpdatesCommand'],
      [messages.toolUpdateAvailable('ripgrep', '13.0.0', '14.0.0')]
    );
  });

  test('should handle brew cask updates', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(brewCaskToolConfig);
    mockVersionChecker.checkVersionStatus.mockResolvedValue(VersionComparisonStatus.NEWER_AVAILABLE);
    mockVersionChecker.getLatestToolVersion.mockResolvedValue('1.86.0');

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

    await program.parseAsync(['check-updates', 'ripgrep'], { from: 'user' });

    logger.expect(['INFO'], ['registerCheckUpdatesCommand'], [messages.toolConfiguredToLatest('ripgrep', '14.0.0')]);
  });

  test('should handle missing formula in brew tool config', async () => {
    const missingFormulaConfig: BrewToolConfig = {
      ...brewToolConfig,
      installParams: {},
    };
    mockConfigService.loadSingleToolConfig.mockResolvedValue(missingFormulaConfig);

    await program.parseAsync(['check-updates', 'ripgrep'], { from: 'user' });

    logger.expect(
      ['ERROR'],
      ['registerCheckUpdatesCommand'],
      [messages.configParameterInvalid('formula', 'undefined', 'formula name')]
    );
  });

  test('should handle brew info command failure', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(brewToolConfig);
    mockVersionChecker.getLatestToolVersion.mockResolvedValue(null);

    await program.parseAsync(['check-updates', 'ripgrep'], { from: 'user' });

    logger.expect(
      ['WARN'],
      ['registerCheckUpdatesCommand'],
      [messages.serviceGithubResourceNotFound('brew formula', 'ripgrep')]
    );
  });
});
