import { describe, it, expect, mock, beforeEach, type Mock as BunMock } from 'bun:test';
import { registerCleanupCommand } from '../cleanupCommand';
import type { AppConfig } from '@modules/config';
import type { IFileSystem } from '@modules/file-system';
import { createClientLogger as actualCreateClientLogger } from '@modules/logger';
import type { GeneratedArtifactsManifest } from '@types';
import path from 'node:path';
import type { Stats } from 'node:fs';
import {
  createMockAppConfig,
  createMemFileSystem,
  createMockClientLogger,
  type CreateMockClientLoggerResult,
} from '@testing-helpers';
import type { GlobalProgram, Services } from '@cli';
import { createProgram } from '@cli';

mock.module('@modules/cli/exitCli', () => ({
  exitCli: mock((code: number) => {
    throw new Error(`MOCK_EXIT_CLI_CALLED_WITH_${code}`);
  }),
}));

const mockCreateClientLogger = mock(actualCreateClientLogger);
mock.module('@modules/logger', () => ({
  createClientLogger: mockCreateClientLogger,
  createLogger: mock(() => mock(() => {})),
}));

describe('cleanupCommand', () => {
  let program: GlobalProgram;
  let mockAppConfig: AppConfig;
  let mockFileSystem: IFileSystem;
  let loggerMocks: CreateMockClientLoggerResult['loggerMocks'];
  let mockServices: Services;

  const MOCK_GENERATED_DIR = '/test/.generated';
  const MOCK_MANIFEST_PATH = path.join(MOCK_GENERATED_DIR, 'manifest.json');
  const MOCK_SHIM_1 = '/usr/bin/shim1';
  const MOCK_SHIM_2 = path.join(MOCK_GENERATED_DIR, 'bin', 'shim2');
  const MOCK_SHELL_INIT = path.join(MOCK_GENERATED_DIR, 'zsh', 'init.zsh');
  const MOCK_SYMLINK_TARGET_1 = '/home/user/.config/tool/config.yml';
  const MOCK_SYMLINK_SOURCE_1 = '/test/dotfiles/tool/config.yml';

  const mockManifest: GeneratedArtifactsManifest = {
    shims: [MOCK_SHIM_1, MOCK_SHIM_2],
    shellInit: { path: MOCK_SHELL_INIT },
    symlinks: [
      {
        sourcePath: MOCK_SYMLINK_SOURCE_1,
        targetPath: MOCK_SYMLINK_TARGET_1,
        status: 'created',
      },
    ],
    lastGenerated: new Date().toISOString(),
  };

  beforeEach(() => {
    mock.restore();
    program = createProgram();

    mockAppConfig = createMockAppConfig({
      dotfilesDir: '/test/dotfiles',
      generatedDir: MOCK_GENERATED_DIR,
      manifestPath: MOCK_MANIFEST_PATH,
      homeDir: '/home/user',
    });

    const { fs } = createMemFileSystem({
      exists: mock(async (_: string) => true),
      readFile: mock(async () => JSON.stringify(mockManifest)),
      lstat: mock(
        async (filePath: string) =>
          ({ isSymbolicLink: () => filePath === MOCK_SYMLINK_TARGET_1 }) as Stats,
      ),
      readlink: mock(async () => MOCK_SYMLINK_SOURCE_1),
    });
    mockFileSystem = fs;

    const { mockClientLogger, loggerMocks: lm } = createMockClientLogger();
    loggerMocks = lm;
    mockCreateClientLogger.mockReturnValue(mockClientLogger);

    mockServices = {
      appConfig: mockAppConfig,
      fs: mockFileSystem,
    } as Services;

    registerCleanupCommand(program, mockServices);
  });

  const runCommand = (args: string[]) => program.parseAsync(['cleanup', ...args], { from: 'user' });

  it('should successfully cleanup with existing manifest and artifacts', async () => {
    await runCommand([]);

    expect(mockFileSystem.readFile).toHaveBeenCalledWith(MOCK_MANIFEST_PATH, 'utf-8');
    expect((mockFileSystem.rm as BunMock<any>)).toHaveBeenCalledWith(MOCK_SHIM_1, { force: true });
    expect((mockFileSystem.rm as BunMock<any>)).toHaveBeenCalledWith(MOCK_SHIM_2, { force: true });
    expect((mockFileSystem.rm as BunMock<any>)).toHaveBeenCalledWith(MOCK_SHELL_INIT, {
      force: true,
    });
    expect((mockFileSystem.rm as BunMock<any>)).toHaveBeenCalledWith(MOCK_SYMLINK_TARGET_1, {
      force: true,
    });
    expect((mockFileSystem.rm as BunMock<any>)).toHaveBeenCalledWith(MOCK_GENERATED_DIR, {
      recursive: true,
      force: true,
    });

    expect(loggerMocks.info).toHaveBeenCalledWith('Starting cleanup...');
    expect(loggerMocks.info).toHaveBeenCalledWith('Deleting shims...');
    expect(loggerMocks.info).toHaveBeenCalledWith(`  Deleted shim: ${MOCK_SHIM_1}`);
    expect(loggerMocks.info).toHaveBeenCalledWith(`  Deleted shim: ${MOCK_SHIM_2}`);
    expect(loggerMocks.info).toHaveBeenCalledWith('Deleting shell init file...');
    expect(loggerMocks.info).toHaveBeenCalledWith(`  Deleted shell init: ${MOCK_SHELL_INIT}`);
    expect(loggerMocks.info).toHaveBeenCalledWith('Deleting symlinks...');
    expect(loggerMocks.info).toHaveBeenCalledWith(`  Deleted symlink: ${MOCK_SYMLINK_TARGET_1}`);
    expect(loggerMocks.info).toHaveBeenCalledWith(
      `Successfully deleted generated directory: ${MOCK_GENERATED_DIR}`,
    );
    expect(loggerMocks.info).toHaveBeenCalledWith('Cleanup complete.');
  });

  it('should cleanup generated directory if manifest file does not exist', async () => {
    (mockFileSystem.exists as BunMock<any>).mockImplementation(
      async (p: string) => p !== MOCK_MANIFEST_PATH,
    );

    await runCommand([]);

    expect(mockFileSystem.readFile).not.toHaveBeenCalled();
    expect((mockFileSystem.rm as BunMock<any>)).not.toHaveBeenCalledWith(MOCK_SHIM_1, {
      force: true,
    });
    expect((mockFileSystem.rm as BunMock<any>)).toHaveBeenCalledWith(MOCK_GENERATED_DIR, {
      recursive: true,
      force: true,
    });
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      `Manifest file not found at ${MOCK_MANIFEST_PATH}.`,
    );
    expect(loggerMocks.info).toHaveBeenCalledWith(
      `Successfully deleted generated directory: ${MOCK_GENERATED_DIR}`,
    );
  });

  it('should not delete any files in dry run mode', async () => {
    await runCommand(['--dry-run']);

    expect(mockFileSystem.readFile).toHaveBeenCalledWith(MOCK_MANIFEST_PATH, 'utf-8');
    expect(mockFileSystem.rm).not.toHaveBeenCalled();

    expect(loggerMocks.info).toHaveBeenCalledWith(
      'Starting dry run cleanup (no files will be removed)...',
    );
    expect(loggerMocks.info).toHaveBeenCalledWith(`  Would delete shim: ${MOCK_SHIM_1}`);
    expect(loggerMocks.info).toHaveBeenCalledWith(
      `Would delete generated directory: ${MOCK_GENERATED_DIR}`,
    );
    expect(loggerMocks.info).toHaveBeenCalledWith('Dry run cleanup complete.');
  });
});
