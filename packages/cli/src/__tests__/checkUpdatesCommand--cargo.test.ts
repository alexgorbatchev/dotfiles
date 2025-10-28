import { beforeEach, describe, mock, test } from 'bun:test';
import type { IConfigService } from '@dotfiles/config';
import type { ICargoClient } from '@dotfiles/installer/clients/cargo';
import type { TestLogger } from '@dotfiles/logger';
import type { CargoToolConfig } from '@dotfiles/schemas';
import type { MockedInterface } from '@dotfiles/testing-helpers';
import type { IVersionChecker } from '@dotfiles/version-checker';
import { VersionComparisonStatus } from '@dotfiles/version-checker';
import { registerCheckUpdatesCommand } from '../checkUpdatesCommand';
import { messages } from '../log-messages';
import type { GlobalProgram } from '../types';
import { createCliTestSetup } from './createCliTestSetup';

describe('checkUpdatesCommand - Cargo Updates', () => {
  let program: GlobalProgram;
  let mockVersionChecker: MockedInterface<IVersionChecker>;
  let mockCargoClient: MockedInterface<ICargoClient>;
  let logger: TestLogger;
  let mockConfigService: MockedInterface<IConfigService>;

  const cargoToolConfig: CargoToolConfig = {
    name: 'exa',
    version: '0.10.1',
    installationMethod: 'cargo',
    installParams: { crateName: 'exa' },
    binaries: ['exa'],
  };

  beforeEach(async () => {
    // Create a configService mock that we can control
    mockConfigService = {
      loadSingleToolConfig: mock(async () => cargoToolConfig),
      loadToolConfigs: mock(async () => ({})),
    };

    const setup = await createCliTestSetup({
      testName: 'check-updates-cargo',
      memFileSystem: { exists: mock(async () => true) },
      services: {
        configService: mockConfigService,
        versionChecker: {
          checkVersionStatus: mock(async () => VersionComparisonStatus.NEWER_AVAILABLE),
          getLatestToolVersion: mock(async () => '0.11.0'),
        },
        cargoClient: {
          getCrateMetadata: mock(async () => null),
          buildCargoTomlUrl: mock(() => 'https://example.com/Cargo.toml'),
          getCargoTomlPackage: mock(async () => null),
          getLatestVersion: mock(async () => '0.11.0'),
        },
      },
    });

    program = setup.program;
    logger = setup.logger;

    // Extract the mocks for individual test manipulation
    mockVersionChecker = setup.mockServices.versionChecker!;
    mockCargoClient = setup.mockServices.cargoClient!;

    registerCheckUpdatesCommand(logger, program, async () => setup.createServices());
  });

  test('should report cargo crate is up-to-date', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(cargoToolConfig);
    mockCargoClient.getLatestVersion.mockResolvedValue('0.10.1');
    mockVersionChecker.checkVersionStatus.mockResolvedValue(VersionComparisonStatus.UP_TO_DATE);

    await program.parseAsync(['check-updates', 'exa'], { from: 'user' });

    logger.expect(['INFO'], ['registerCheckUpdatesCommand'], [messages.toolUpToDate('exa', '0.10.1', '0.10.1')]);
  });

  test('should report cargo crate update available', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(cargoToolConfig);
    mockCargoClient.getLatestVersion.mockResolvedValue('0.11.0');
    mockVersionChecker.checkVersionStatus.mockResolvedValue(VersionComparisonStatus.NEWER_AVAILABLE);

    await program.parseAsync(['check-updates', 'exa'], { from: 'user' });

    logger.expect(['INFO'], ['registerCheckUpdatesCommand'], [messages.toolUpdateAvailable('exa', '0.10.1', '0.11.0')]);
  });

  test('should handle cargo tool configured with "latest" version', async () => {
    const cargoLatestConfig: CargoToolConfig = { ...cargoToolConfig, version: 'latest' };
    mockConfigService.loadSingleToolConfig.mockResolvedValue(cargoLatestConfig);
    mockCargoClient.getLatestVersion.mockResolvedValue('0.12.0');

    await program.parseAsync(['check-updates', 'exa'], { from: 'user' });

    logger.expect(['INFO'], ['registerCheckUpdatesCommand'], [messages.toolConfiguredToLatest('exa', '0.12.0')]);
  });

  test('should handle missing crateName in cargo tool config', async () => {
    const missingCrateConfig = {
      ...cargoToolConfig,
      installParams: {},
    } as CargoToolConfig;
    mockConfigService.loadSingleToolConfig.mockResolvedValue(missingCrateConfig);

    await program.parseAsync(['check-updates', 'exa'], { from: 'user' });

    logger.expect(
      ['ERROR'],
      ['registerCheckUpdatesCommand'],
      [messages.configParameterInvalid('crateName', 'undefined', 'crate name')]
    );
  });

  test('should handle cargo client error gracefully', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(cargoToolConfig);
    mockCargoClient.getLatestVersion.mockRejectedValue(new Error('Cargo API Down'));

    await program.parseAsync(['check-updates', 'exa'], { from: 'user' });

    logger.expect(
      ['ERROR'],
      ['registerCheckUpdatesCommand'],
      [messages.serviceGithubApiFailed('get crate info', 0)]
    );
  });

  test('should handle cargo API returning null version', async () => {
    mockConfigService.loadSingleToolConfig.mockResolvedValue(cargoToolConfig);
    mockCargoClient.getLatestVersion.mockResolvedValue(null);

    await program.parseAsync(['check-updates', 'exa'], { from: 'user' });

    logger.expect(
      ['WARN'],
      ['registerCheckUpdatesCommand'],
      [messages.serviceGithubResourceNotFound('version', 'exa crate')]
    );
  });
});