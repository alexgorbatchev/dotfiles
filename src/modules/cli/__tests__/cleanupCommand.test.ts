import type { GlobalProgram, Services } from '@cli';
import { createProgram } from '@cli';
import { type YamlConfig } from '@modules/config';
import { createYamlConfigFromObject, } from '@modules/config-loader';
import { createClientLogger as actualCreateClientLogger } from '@modules/logger';
import { clearMockRegistry, createModuleMocker, setupTestCleanup } from '@rageltd/bun-test-utils';
import {
  createMemFileSystem,
  createMockClientLogger,
  type CreateMockClientLoggerResult,
  type MockedFileSystem,
} from '@testing-helpers';
import type { GeneratedArtifactsManifest } from '@types';
import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { registerCleanupCommand } from '../cleanupCommand';

setupTestCleanup();

const mockModules = createModuleMocker();

const mockExitCli = mock((code: number) => {
  throw new Error(`MOCK_EXIT_CLI_CALLED_WITH_${code}`);
});

const mockCreateClientLogger = mock(actualCreateClientLogger);
const mockCreateLogger = mock(() => mock(() => {}));

describe('cleanupCommand', () => {
  afterEach(() => {
    clearMockRegistry();
  });

  let program: GlobalProgram;
  let mockYamlConfig: YamlConfig;
  let mockFs: MockedFileSystem;
  let loggerMocks: CreateMockClientLoggerResult['loggerMocks'];
  let mockShim1 = '';
  let mockShim2 = '';
  let mockShellInit = '';
  let mockSymlinkTarget = '';
  let mockSymlinkSource = '';
  const runCommand = (args: string[]) => program.parseAsync(['cleanup', ...args], { from: 'user' });

  beforeEach(async () => {
    mock.restore();
    program = createProgram();

    await mockModules.mock('@modules/cli/exitCli', () => ({
      exitCli: mockExitCli,
    }));

    await mockModules.mock('@modules/logger', () => ({
      createClientLogger: mockCreateClientLogger,
      createLogger: mockCreateLogger,
    }));

    const { fs, addFiles, addSymlinks } = await createMemFileSystem({
    });

    mockYamlConfig = await createYamlConfigFromObject(fs);

    mockFs = fs;
    mockShim1 = '/usr/bin/shim1';
    mockShim2 = `${mockYamlConfig.paths.generatedDir}/bin/shim2`;
    mockShellInit = `${mockYamlConfig.paths.generatedDir}/zsh/init.zsh`;
    mockSymlinkSource = `${mockYamlConfig.paths.dotfilesDir}/tool/config.yml`;
    mockSymlinkTarget = `${mockYamlConfig.paths.targetDir}/.config/tool/config.yml`;

    const mockManifest: GeneratedArtifactsManifest = {
      shims: [mockShim1, mockShim2],
      shellInit: { path: mockShellInit },
      symlinks: [
        {
          sourcePath: mockSymlinkSource,
          targetPath: mockSymlinkTarget,
          status: 'created',
        },
      ],
      lastGenerated: new Date().toISOString(),
    };

    addFiles({
      [mockYamlConfig.paths.manifestPath]: JSON.stringify(mockManifest),
      [mockSymlinkSource]: 'content',
      [mockShim1]: 'content',
      [mockShim2]: 'content',
      [mockShellInit]: 'content',
    });

    addSymlinks({
      [mockSymlinkSource]: mockSymlinkTarget,
    });

    const { mockClientLogger, loggerMocks: lm } = createMockClientLogger();
    loggerMocks = lm;
    mockCreateClientLogger.mockReturnValue(mockClientLogger);

    registerCleanupCommand(program, {
      yamlConfig: mockYamlConfig,
      fs: mockFs.asIFileSystem,
    } as Services);
  });

  afterEach(() => {
    clearMockRegistry();
  });

  afterAll(() => {
    mockModules.restoreAll();
  });

  it('should successfully cleanup with existing manifest and artifacts', async () => {
    await runCommand([]);

    expect(mockFs.readFile).toHaveBeenCalledWith(mockYamlConfig.paths.manifestPath, 'utf-8');
    expect(mockFs.rm).toHaveBeenCalledWith(mockShim1, { force: true });
    expect(mockFs.rm).toHaveBeenCalledWith(mockShim2, { force: true });
    expect(mockFs.rm).toHaveBeenCalledWith(mockShellInit, { force: true });
    expect(mockFs.rm).toHaveBeenCalledWith(mockSymlinkTarget, { force: true });
    expect(mockFs.rm).toHaveBeenCalledWith(mockYamlConfig.paths.generatedDir, {
      recursive: true,
      force: true,
    });

    expect(loggerMocks.info).toHaveBeenCalledWith('Starting cleanup...');
    expect(loggerMocks.info).toHaveBeenCalledWith('Deleting shims...');
    expect(loggerMocks.info).toHaveBeenCalledWith(`  Deleted shim: ${mockShim1}`);
    expect(loggerMocks.info).toHaveBeenCalledWith(`  Deleted shim: ${mockShim2}`);
    expect(loggerMocks.info).toHaveBeenCalledWith('Deleting shell init file...');
    expect(loggerMocks.info).toHaveBeenCalledWith(`  Deleted shell init: ${mockShellInit}`);
    expect(loggerMocks.info).toHaveBeenCalledWith('Deleting symlinks...');
    expect(loggerMocks.info).toHaveBeenCalledWith(`  Deleted symlink: ${mockSymlinkTarget}`);
    expect(loggerMocks.info).toHaveBeenCalledWith(
      `Successfully deleted generated directory: ${mockYamlConfig.paths.generatedDir}`
    );
    expect(loggerMocks.info).toHaveBeenCalledWith('Cleanup complete.');
  });

  it('should cleanup generated directory if manifest file does not exist', async () => {
    mockFs.exists.mockImplementation(async (p: string) => p !== mockYamlConfig.paths.manifestPath);
    mockFs.readFile.mockClear();

    await runCommand([]);

    expect(mockFs.readFile).not.toHaveBeenCalled();
    expect(mockFs.rm).not.toHaveBeenCalledWith(mockShim1, { force: true });
    expect(mockFs.rm).toHaveBeenCalledWith(mockYamlConfig.paths.generatedDir, {
      recursive: true,
      force: true,
    });
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      `Manifest file not found at ${mockYamlConfig.paths.manifestPath}.`
    );
    expect(loggerMocks.info).toHaveBeenCalledWith(
      `Successfully deleted generated directory: ${mockYamlConfig.paths.generatedDir}`
    );
  });

  it('should not delete any files in dry run mode', async () => {
    await runCommand(['--dry-run']);

    expect(mockFs.readFile).toHaveBeenCalledWith(mockYamlConfig.paths.manifestPath, 'utf-8');
    expect(mockFs.rm).not.toHaveBeenCalled();

    expect(loggerMocks.info).toHaveBeenCalledWith(
      'Starting dry run cleanup (no files will be removed)...'
    );
    expect(loggerMocks.info).toHaveBeenCalledWith(`  Would delete shim: ${mockShim1}`);
    expect(loggerMocks.info).toHaveBeenCalledWith(
      `Would delete generated directory: ${mockYamlConfig.paths.generatedDir}`
    );
    expect(loggerMocks.info).toHaveBeenCalledWith('Dry run cleanup complete.');
  });
});
