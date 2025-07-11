import type { GlobalProgram, Services } from '@cli';
import { createProgram } from '@cli';
import { exitCli } from '@modules/cli/exitCli';
import type { YamlConfig } from '@modules/config';
import {
  loadToolConfigsFromDirectory as actualLoadToolConfigsFromDirectory,
  createYamlConfigFromObject,
} from '@modules/config-loader';
import type { IFileSystem } from '@modules/file-system';
import type { IGeneratorOrchestrator } from '@modules/generator-orchestrator';
import { createClientLogger as actualCreateClientLogger } from '@modules/logger';
import {
  createMemFileSystem,
  createMockClientLogger,
  type CreateMockClientLoggerResult,
} from '@testing-helpers';
import type { GeneratedArtifactsManifest, SystemInfo, ToolConfig } from '@types';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { registerGenerateCommand } from '../generateCommand';

// Mock dependencies
mock.module('@modules/cli/exitCli', () => ({
  exitCli: mock((code: number) => {
    throw new Error(`MOCK_EXIT_CLI_CALLED_WITH_${code}`);
  }),
}));

const mockLoadToolConfigsFromDirectory = mock(actualLoadToolConfigsFromDirectory);
mock.module('@modules/config-loader', () => ({
  loadToolConfigsFromDirectory: mockLoadToolConfigsFromDirectory,
  loadSingleToolConfig: mock(async () => ({})),
  getDefaultConfigPath: mock(() => '/test/default-config.yaml'),
  createYamlConfigFromObject: mock(async (_fs, config, _systemInfo, _env) => config),
}));

const mockCreateClientLogger = mock(actualCreateClientLogger);
mock.module('@modules/logger', () => ({
  createClientLogger: mockCreateClientLogger,
  createLogger: mock(() => mock(() => {})),
}));

describe('generateCommand', () => {
  let program: GlobalProgram;
  let mockYamlConfig: YamlConfig;
  let loggerMocks: CreateMockClientLoggerResult['loggerMocks'];
  let memFs: IFileSystem;
  let mockGeneratorOrchestrator: IGeneratorOrchestrator;

  const toolAConfig: ToolConfig = {
    name: 'toolA',
    version: '1.0.0',
    binaries: ['toolA-bin'],
    symlinks: [{ source: 'toolA/.config', target: '.config/toolA' }],
  } as ToolConfig;

  const mockManifest: GeneratedArtifactsManifest = {
    shims: ['/test/target/toolA-bin'],
    shellInit: { path: '/test/generated/init.sh' },
    symlinks: [
      {
        sourcePath: '/test/dotfiles/toolA/.config',
        targetPath: '/test/home/.config/toolA',
        status: 'created',
      },
    ],
    lastGenerated: new Date().toISOString(),
  };

  beforeEach(async () => {
    mock.restore();

    program = createProgram();

    const fsHelperReturn = createMemFileSystem();
    memFs = fsHelperReturn.fs;

    mockYamlConfig = await createYamlConfigFromObject(
      memFs,
      {
        paths: {
          dotfilesDir: '/test/dotfiles',
          targetDir: '/test/target',
          generatedDir: '/test/generated',
          toolConfigsDir: '/test/tools',
          completionsDir: '/test/completions',
          manifestPath: '/test/generated/manifest.json',
          binariesDir: '/test/generated/bin',
        },
      },
      { platform: 'linux', arch: 'x64', homeDir: '/test/home' } as SystemInfo,
      {}
    );

    const loggerHelperReturn = createMockClientLogger();
    loggerMocks = loggerHelperReturn.loggerMocks;
    mockCreateClientLogger.mockReturnValue(loggerHelperReturn.mockClientLogger);

    mockGeneratorOrchestrator = {
      generateAll: mock(async () => mockManifest),
    };

    registerGenerateCommand(program, {
      yamlConfig: mockYamlConfig,
      fs: memFs,
      generatorOrchestrator: mockGeneratorOrchestrator,
    } as Services);
  });

  test('should successfully generate artifacts', async () => {
    mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });

    await program.parseAsync(['generate'], { from: 'user' });

    expect(mockLoadToolConfigsFromDirectory).toHaveBeenCalledWith(
      mockYamlConfig.paths.toolConfigsDir,
      memFs
    );
    expect(mockGeneratorOrchestrator.generateAll).toHaveBeenCalledWith({ toolA: toolAConfig }, {});

    expect(loggerMocks.info).toHaveBeenCalledWith('Artifact generation complete.');
    expect(loggerMocks.info).toHaveBeenCalledWith('Generated 1 shims in /test/target');
    expect(loggerMocks.info).toHaveBeenCalledWith(
      'Shell init file generated at: /test/generated/init.sh'
    );
    expect(loggerMocks.info).toHaveBeenCalledWith('Processed 1 symlink operations.');
  });

  test('should handle errors during artifact generation', async () => {
    const generationError = new Error('Generation failed');
    mockLoadToolConfigsFromDirectory.mockResolvedValue({ toolA: toolAConfig });
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
