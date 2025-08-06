import type { GlobalProgram, Services } from '@cli';
import { createProgram } from '@cli';
import { type YamlConfig } from '@modules/config';
import { createYamlConfigFromObject } from '@modules/config-loader';
import { clearMockRegistry, createModuleMocker, setupTestCleanup } from '@rageltd/bun-test-utils';
import {
  TestLogger,
  createMemFileSystem,
  type MockedFileSystem,
} from '@testing-helpers';
import type { GeneratedArtifactsManifest } from '@types';
import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { registerCleanupCommand } from '../cleanupCommand';

setupTestCleanup();

const mockModules = createModuleMocker();

describe('cleanupCommand', () => {
  let program: GlobalProgram;
  let mockYamlConfig: YamlConfig;
  let mockFs: MockedFileSystem;
  let logger: TestLogger;
  let mockShim1 = '';
  let mockShim2 = '';
  let mockShellInit = '';
  let mockSymlinkTarget = '';
  let mockSymlinkSource = '';
  const runCommand = (args: string[]) => program.parseAsync(['cleanup', ...args], { from: 'user' });

  beforeEach(async () => {
    mock.restore();
    program = createProgram();
    logger = new TestLogger();

    const { fs, addFiles, addSymlinks } = await createMemFileSystem({});

    mockYamlConfig = await createYamlConfigFromObject(logger, fs);

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

    registerCleanupCommand(logger, program, async () => ({
      yamlConfig: mockYamlConfig,
      fs: mockFs.asIFileSystem,
    } as Services));
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

    logger.expect(
      ['INFO'],
      ['registerCleanupCommand', 'cleanupActionLogic'],
      [
        'cleanup started',
        'shim deletion',
        `[cleanup] Deleted: shim: ${mockShim1}`,
        '[cleanup] Deleted: shim: ~/.dotfiles/.generated/bin/shim2',
        'shell init file deletion',
        '[cleanup] Deleted: shell init: ~/.dotfiles/.generated/zsh/init.zsh',
        'symlink deletion',
        '[cleanup] Deleted: symlink: ~/.dotfiles/.generated/usr-local-bin/.config/tool/config.yml',
        '[cleanup] Deleted: ~/.dotfiles/.generated',
        'Cleanup completed',
      ],
    );
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
    logger.expect(
      ['INFO', 'WARN'],
      ['registerCleanupCommand', 'cleanupActionLogic'],
      [
        'cleanup started',
        `Manifest file not found: ${mockYamlConfig.paths.manifestPath}`,
        '[cleanup] Deleted: ~/.dotfiles/.generated',
        'Cleanup completed',
      ],
    );
  });

  it('should not delete any files in dry run mode', async () => {
    await runCommand(['--dry-run']);

    expect(mockFs.readFile).toHaveBeenCalledWith(mockYamlConfig.paths.manifestPath, 'utf-8');
    expect(mockFs.rm).not.toHaveBeenCalled();

    logger.expect(
      ['INFO'],
      ['registerCleanupCommand', 'cleanupActionLogic'],
      [
        'dry run cleanup (no files will be removed) started',
        'shim deletion',
        `Would delete: ${mockShim1}`,
        `Would delete: ${mockShim2}`,
        'shell init file deletion',
        `Would delete: ${mockShellInit}`,
        'symlink deletion',
        `Would delete: ${mockSymlinkTarget}`,
        `Would delete generated directory: ${mockYamlConfig.paths.generatedDir}`,
        'Dry run cleanup completed',
      ],
    );
  });
});
