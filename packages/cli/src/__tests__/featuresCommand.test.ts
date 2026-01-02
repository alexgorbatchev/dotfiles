import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { IConfigService, ProjectConfig } from '@dotfiles/config';
import { Architecture, Platform, type ToolConfig } from '@dotfiles/core';
import type { IMemFileSystemReturn } from '@dotfiles/file-system';
import type { TestLogger } from '@dotfiles/logger';
import type { MockedInterface } from '@dotfiles/testing-helpers';
import { registerFeaturesCommand } from '../featuresCommand';
import { messages } from '../log-messages';
import type { IGlobalProgram } from '../types';
import { createCliTestSetup } from './createCliTestSetup';

const createMockConfigService = (): MockedInterface<IConfigService> => ({
  loadSingleToolConfig: mock(async () => undefined),
  loadToolConfigs: mock(async () => ({})),
});

describe('featuresCommand', () => {
  let program: IGlobalProgram;
  let mockProjectConfig: ProjectConfig;
  let logger: TestLogger;
  let mockFs: IMemFileSystemReturn;
  let mockConfigService: MockedInterface<IConfigService>;

  const toolAConfig: ToolConfig = {
    name: 'toolA',
    version: '1.0.0',
    binaries: ['toolA-bin'],
    symlinks: [{ source: 'toolA/.config', target: '.config/toolA' }],
    installationMethod: 'github-release',
    installParams: {
      repo: 'owner/toolA',
    },
  } as ToolConfig;

  beforeEach(async () => {
    const setup = await createCliTestSetup({
      testName: 'features-command',
    });

    program = setup.program;
    logger = setup.logger;
    mockFs = setup.mockFs;
    mockProjectConfig = setup.mockProjectConfig;

    mockConfigService = createMockConfigService();
    mockConfigService.loadToolConfigs.mockResolvedValue({ toolA: toolAConfig });

    registerFeaturesCommand(logger, program, async () => ({
      ...setup.createServices(),
      configService: mockConfigService,
    }));
  });

  afterEach(() => {
    // Reset all mocks
    mockConfigService.loadToolConfigs.mockReset();
    mockConfigService.loadSingleToolConfig.mockReset();
  });

  test('should successfully generate catalog', async () => {
    await program.parseAsync(['features', 'catalog'], { from: 'user' });

    expect(mockConfigService.loadToolConfigs).toHaveBeenCalledWith(
      expect.any(Object),
      mockProjectConfig.paths.toolConfigsDir,
      mockFs.fs.asIFileSystem,
      mockProjectConfig,
      expect.objectContaining({
        platform: Platform.Linux,
        arch: Architecture.X86_64,
        homeDir: mockProjectConfig.paths.homeDir,
      })
    );

    // Should log DONE message at the end
    logger.expect(['INFO'], ['registerFeaturesCommand'], [messages.commandCompleted(false)]);
  });

  test('should successfully generate catalog in dry run mode', async () => {
    await program.parseAsync(['features', 'catalog', '--dry-run'], { from: 'user' });

    expect(mockConfigService.loadToolConfigs).toHaveBeenCalledWith(
      expect.any(Object),
      mockProjectConfig.paths.toolConfigsDir,
      mockFs.fs.asIFileSystem,
      mockProjectConfig,
      expect.objectContaining({
        platform: Platform.Linux,
        arch: Architecture.X86_64,
        homeDir: mockProjectConfig.paths.homeDir,
      })
    );

    // Should log DONE (dry run) message at the end
    logger.expect(['INFO'], ['registerFeaturesCommand'], [messages.commandCompleted(true)]);
  });

  test('should handle errors during catalog generation', async () => {
    const generationError = new Error('Catalog generation failed');

    // Create a new program for this test to avoid command conflicts
    const {
      program: errorTestProgram,
      logger: errorLogger,
      createServices,
    } = await createCliTestSetup({
      testName: 'features-command-error',
    });

    // Mock the service to throw an error
    const mockReadmeService = {
      fetchReadmeForVersion: mock(async () => null),
      getCachedReadme: mock(async () => null),
      generateCombinedReadme: mock(async () => ''),
      getGitHubTools: mock(async () => []),
      clearExpiredCache: mock(async () => {}),
      writeReadmeToPath: mock(async () => null),
      generateCatalogFromConfigs: mock(async () => {
        throw generationError;
      }),
    };

    registerFeaturesCommand(errorLogger, errorTestProgram, async () => ({
      ...createServices(),
      configService: mockConfigService,
      readmeService: mockReadmeService,
    }));

    expect(errorTestProgram.parseAsync(['features', 'catalog'], { from: 'user' })).rejects.toThrow(
      'MOCK_EXIT_CLI_CALLED_WITH_1'
    );

    errorLogger.expect(
      ['ERROR'],
      ['registerFeaturesCommand'],
      [messages.commandExecutionFailed('features catalog', 1)]
    );
  });
});
