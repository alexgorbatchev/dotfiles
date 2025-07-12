import type { GlobalProgram, Services } from '@cli';
import { createProgram } from '@cli';
import { exitCli } from '@modules/cli/exitCli';
import type { YamlConfig } from '@modules/config';
import { createYamlConfigFromObject, getDefaultConfigPath } from '@modules/config-loader';
import type { IGeneratorOrchestrator } from '@modules/generator-orchestrator';
import { createClientLogger as actualCreateClientLogger } from '@modules/logger';
import {
  createMemFileSystem,
  createMockClientLogger,
  type CreateMockClientLoggerResult,
  type MockedFileSystem,
} from '@testing-helpers';
import type { GeneratedArtifactsManifest, ToolConfig } from '@types';
import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import yaml from 'yaml';
import { MOCK_DEFAULT_CONFIG } from '@modules/config-loader/__tests__/fixtures';
import { registerGenerateCommand } from '../generateCommand';
import {
  createModuleMocker,
  setupTestCleanup,
  clearMockRegistry
} from '@rageltd/bun-test-utils';

// Setup cleanup once per file
setupTestCleanup();

const mockModules = createModuleMocker();

const mockExitCli = mock((code: number) => {
  throw new Error(`MOCK_EXIT_CLI_CALLED_WITH_${code}`);
});

const mockCreateClientLogger = mock(actualCreateClientLogger);
const mockCreateLogger = mock(() => mock(() => {}));

describe('generateCommand', () => {
  let program: GlobalProgram;
  let mockYamlConfig: YamlConfig;
  let loggerMocks: CreateMockClientLoggerResult['loggerMocks'];
  let memFs: MockedFileSystem;
  let mockGeneratorOrchestrator: IGeneratorOrchestrator;

  const toolAConfig: ToolConfig = {
    name: 'toolA',
    version: '1.0.0',
    binaries: ['toolA-bin'],
    symlinks: [{ source: 'toolA/.config', target: '.config/toolA' }],
  } as ToolConfig;

  beforeEach(async () => {
    program = createProgram();

    const { fs, addFiles } = createMemFileSystem({
      initialVolumeJson: {
        [getDefaultConfigPath()]: MOCK_DEFAULT_CONFIG,
      },
    });
    memFs = fs;

    mockYamlConfig = await createYamlConfigFromObject(memFs);

    addFiles({
      [`${mockYamlConfig.paths.toolConfigsDir}/toolA.yaml`]: yaml.stringify(toolAConfig)
    });

    const mockManifest: GeneratedArtifactsManifest = {
      shims: ['/test/target/toolA-bin'],
      shellInit: { path: `${mockYamlConfig.paths.generatedDir}/init.sh` },
      symlinks: [
        {
          sourcePath: '/test/dotfiles/toolA/.config',
          targetPath: '/test/home/.config/toolA',
          status: 'created',
        },
      ],
      lastGenerated: new Date().toISOString(),
    };

    const loggerHelperReturn = createMockClientLogger();
    loggerMocks = loggerHelperReturn.loggerMocks;
    mockCreateClientLogger.mockReturnValue(loggerHelperReturn.mockClientLogger);

    mockGeneratorOrchestrator = {
      generateAll: mock(async () => mockManifest),
    };

    // Set up mocks
    await mockModules.mock('@modules/cli/exitCli', () => ({
      exitCli: mockExitCli,
    }));
    
    await mockModules.mock('@modules/logger', () => ({
      createClientLogger: mockCreateClientLogger,
      createLogger: mockCreateLogger,
    }));

    registerGenerateCommand(program, {
      yamlConfig: mockYamlConfig,
      fs: memFs.asIFileSystem,
      generatorOrchestrator: mockGeneratorOrchestrator,
    } as Services);
  });

  afterEach(() => {
    clearMockRegistry();
  });

  afterAll(() => {
    mockModules.restoreAll();
  });

  test('should successfully generate artifacts', async () => {
    await program.parseAsync(['generate'], { from: 'user' });

    expect(loggerMocks.info).toHaveBeenCalledWith('Artifact generation complete.');
    expect(loggerMocks.info).toHaveBeenCalledWith(
      `Generated 1 shims in ${mockYamlConfig.paths.targetDir}`
    );
    expect(loggerMocks.info).toHaveBeenCalledWith(
      `Shell init file generated at: ${mockYamlConfig.paths.generatedDir}/init.sh`
    );
    expect(loggerMocks.info).toHaveBeenCalledWith('Processed 1 symlink operations.');
  });

  test('should handle errors during artifact generation', async () => {
    const generationError = new Error('Generation failed');
    (mockGeneratorOrchestrator.generateAll as any).mockRejectedValue(generationError);

    await expect(program.parseAsync(['generate'], { from: 'user' })).rejects.toThrow(
      'MOCK_EXIT_CLI_CALLED_WITH_1'
    );

    expect(loggerMocks.error).toHaveBeenCalledWith(
      'Critical error in generate command: %s',
      generationError.message
    );
    expect(exitCli).toHaveBeenCalledWith(1);
  });
});
