/**
 * @file cleanupCommand.test.ts
 * @description Tests for the CleanupCommand.
 *
 * ## Development Plan
 *
 * - [x] Test suite setup: import necessary modules, mock dependencies.
 * - [x] Test case: successful cleanup with existing manifest and artifacts.
 *   - [x] Mock `AppConfig` with paths.
 *   - [x] Mock `IFileSystem` to simulate existing manifest, shims, shell init, symlinks, and generated directory.
 *   - [x] Mock `ClientLogger` methods.
 *   - [x] Instantiate `CleanupCommand` and call `execute()`.
 *   - [x] Verify `fs.rm` was called for all expected artifacts and the generated directory.
 *   - [x] Verify `logger.info` and `logger.warn` calls.
 * - [x] Test case: cleanup when manifest file does not exist.
 *   - [x] `fs.exists` for manifest returns `false`.
 *   - [x] Verify `fs.rm` is still called for `generatedDir`.
 *   - [x] Verify appropriate `logger.warn` call for missing manifest.
 * - [x] Test case: cleanup when manifest file is unparseable.
 *   - [x] `fs.readFile` for manifest throws an error or returns invalid JSON.
 *   - [x] Verify `fs.rm` is still called for `generatedDir`.
 *   - [x] Verify appropriate `logger.error` and `logger.warn` calls.
 * - [x] Test case: cleanup when some artifacts listed in manifest do not exist on disk.
 *   - [x] `fs.exists` or `fs.lstat` returns `false` for some shims/symlinks.
 *   - [x] Verify `fs.rm` is not called for non-existent items.
 *   - [x] Verify appropriate `logger.warn` calls for missing items.
 * - [x] Test case: cleanup when `generatedDir` does not exist.
 *   - [x] `fs.exists` for `generatedDir` returns `false`.
 *   - [x] Verify `fs.rm` is not called for `generatedDir`.
 *   - [x] Verify appropriate `logger.info` call.
 * - [x] Test case: error during deletion of an artifact.
 *   - [x] `fs.rm` for a specific shim throws an error.
 *   - [x] Verify `logger.error` is called for that specific error.
 *   - [x] Verify cleanup continues for other artifacts and `generatedDir`.
 * - [x] Test case: error during deletion of `generatedDir`.
 *   - [x] `fs.rm` for `generatedDir` throws an error.
 *   - [x] Verify `logger.error` is called for that error.
 * - [x] Test case: dry run mode.
 *   - [x] Instantiate `CleanupCommand` with `dryRun` set to `true`.
 *   - [x] Verify `fs.rm` is not called for any artifacts or the generated directory.
 *   - [x] Verify appropriate "Would delete" log messages.
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [x] Ensure 100% test coverage for executable code.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { describe, it, expect, mock, beforeEach, type Mock as BunMock } from 'bun:test';
import { CleanupCommand } from '../cleanupCommand';
import type { AppConfig } from '@modules/config';
import type { IFileSystem } from '@modules/file-system';
import { createClientLogger } from '@modules/logger/clientLogger';
import type { GeneratedArtifactsManifest } from '@types';
import path from 'node:path';
import type { Stats } from 'node:fs';
import { createMockAppConfig } from '@testing-helpers';

describe('CleanupCommand', () => {
  let mockAppConfig: AppConfig;
  let mockFileSystem: IFileSystem;
  let mockLogger: ReturnType<typeof createClientLogger>;

  const MOCK_GENERATED_DIR = '/test/.generated';
  const MOCK_MANIFEST_PATH = path.join(MOCK_GENERATED_DIR, 'manifest.json');
  const MOCK_SHIM_1 = '/usr/bin/shim1';
  const MOCK_SHIM_2 = path.join(MOCK_GENERATED_DIR, 'bin', 'shim2'); // Test a shim inside generated
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
        // backupPath: null, // Removed as it's not in SymlinkOperationResult
      },
    ],
    lastGenerated: new Date().toISOString(),
  };

  beforeEach(() => {
    mockAppConfig = createMockAppConfig({
      dotfilesDir: '/test/dotfiles',
      generatedDir: MOCK_GENERATED_DIR,
      manifestPath: MOCK_MANIFEST_PATH,
      targetDir: '/usr/bin',
      toolConfigsDir: '/test/dotfiles/generator/configs/tools',
      zshInitDir: path.join(MOCK_GENERATED_DIR, 'zsh'),
      homeDir: '/home/user',
      cacheDir: path.join(MOCK_GENERATED_DIR, 'cache'),
      binariesDir: path.join(MOCK_GENERATED_DIR, 'binaries'),
      binDir: path.join(MOCK_GENERATED_DIR, 'bin'),
      completionsDir: path.join(MOCK_GENERATED_DIR, 'completions'),
      githubApiCacheEnabled: true,
      githubApiCacheTtl: 3600000,
      githubClientUserAgent: 'test-agent',
      githubHost: 'api.github.com',
      // Ensure all required fields from AppConfig are present or provide defaults in createMockAppConfig
      toolConfigDir: '/test/dotfiles/generator/src/tools', // Deprecated but in type
      debug: '',
      cacheEnabled: true,
      generatedArtifactsManifestPath: path.join(MOCK_GENERATED_DIR, 'artifacts-manifest.json'),
      githubApiCacheDir: path.join(MOCK_GENERATED_DIR, 'cache', 'github-api'),
      generatorCliShimName: 'dotfiles-generator-shim',
    });

    mockFileSystem = {
      exists: mock(async () => true),
      readFile: mock(async () => JSON.stringify(mockManifest)),
      writeFile: mock(async () => {}),
      rm: mock(async (_path: string, _opts?: { recursive?: boolean; force?: boolean }) => {}),
      ensureDir: mock(async () => {}),
      mkdir: mock(async () => {}), // Added
      rmdir: mock(async () => {}), // Added
      stat: mock(async (_filePath: string): Promise<Stats> => ({ // Added stat mock, prefixed filePath
        isSymbolicLink: () => false, // Regular stat doesn't usually report on symlink itself
        isFile: () => true,
        isDirectory: () => false,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isFIFO: () => false,
        isSocket: () => false,
        dev: 0,
        ino: 0,
        mode: 0o755,
        nlink: 1,
        uid: 0,
        gid: 0,
        rdev: 0,
        size: 100,
        blksize: 4096,
        blocks: 1,
        atimeMs: Date.now(),
        mtimeMs: Date.now(),
        ctimeMs: Date.now(),
        birthtimeMs: Date.now(),
        atime: new Date(),
        mtime: new Date(),
        ctime: new Date(),
        birthtime: new Date(),
      } as Stats)),
      lstat: mock(async (filePath: string): Promise<Stats> => ({
        isSymbolicLink: () => filePath === MOCK_SYMLINK_TARGET_1,
        isFile: () => true,
        isDirectory: () => false,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isFIFO: () => false,
        isSocket: () => false,
        dev: 0,
        ino: 0,
        mode: 0o755,
        nlink: 1,
        uid: 0,
        gid: 0,
        rdev: 0,
        size: 100,
        blksize: 4096,
        blocks: 1,
        atimeMs: Date.now(),
        mtimeMs: Date.now(),
        ctimeMs: Date.now(),
        birthtimeMs: Date.now(),
        atime: new Date(),
        mtime: new Date(),
        ctime: new Date(),
        birthtime: new Date(),
      } as Stats)),
      readlink: mock(async () => MOCK_SYMLINK_SOURCE_1),
      symlink: mock(async () => {}),
      chmod: mock(async () => {}),
      readdir: mock(async () => []),
      copyFile: mock(async () => {}),
      rename: mock(async () => {}),
      // mkdirTemp: mock(async () => '/tmp/test-XXXXXX'), // Removed as it's not in IFileSystem
    };

    mockLogger = {
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      debug: mock(() => {}),
      success: mock(() => {}),
      log: mock(() => {}),
      fatal: mock(() => {}),
      trace: mock(() => {}),
      verbose: mock(() => {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any; // Cast to any to satisfy ConsolaInstance type if methods are missing
  });

  it('should successfully cleanup with existing manifest and artifacts', async () => {
    const command = new CleanupCommand(mockAppConfig, mockFileSystem, mockLogger);
    await command.execute();

    expect(mockFileSystem.readFile).toHaveBeenCalledWith(MOCK_MANIFEST_PATH, 'utf-8');
    expect(mockFileSystem.rm).toHaveBeenCalledWith(MOCK_SHIM_1, { force: true });
    expect(mockFileSystem.rm).toHaveBeenCalledWith(MOCK_SHIM_2, { force: true });
    expect(mockFileSystem.rm).toHaveBeenCalledWith(MOCK_SHELL_INIT, { force: true });
    expect(mockFileSystem.rm).toHaveBeenCalledWith(MOCK_SYMLINK_TARGET_1, { force: true });
    expect(mockFileSystem.rm).toHaveBeenCalledWith(MOCK_GENERATED_DIR, { recursive: true, force: true });

    expect(mockLogger.info).toHaveBeenCalledWith('Starting cleanup...');
    expect(mockLogger.info).toHaveBeenCalledWith('Deleting shims...');
    expect(mockLogger.info).toHaveBeenCalledWith(`  Deleted shim: ${MOCK_SHIM_1}`);
    expect(mockLogger.info).toHaveBeenCalledWith(`  Deleted shim: ${MOCK_SHIM_2}`);
    expect(mockLogger.info).toHaveBeenCalledWith('Deleting shell init file...');
    expect(mockLogger.info).toHaveBeenCalledWith(`  Deleted shell init: ${MOCK_SHELL_INIT}`);
    expect(mockLogger.info).toHaveBeenCalledWith('Deleting symlinks...');
    expect(mockLogger.info).toHaveBeenCalledWith(`  Deleted symlink: ${MOCK_SYMLINK_TARGET_1}`);
    expect(mockLogger.info).toHaveBeenCalledWith(`Successfully deleted generated directory: ${MOCK_GENERATED_DIR}`);
    expect(mockLogger.info).toHaveBeenCalledWith('Cleanup complete.');
  });

  it('should cleanup generated directory if manifest file does not exist', async () => {
    (mockFileSystem.exists as BunMock<typeof mockFileSystem.exists>).mockImplementation(async (p: string) => p !== MOCK_MANIFEST_PATH);

    const command = new CleanupCommand(mockAppConfig, mockFileSystem, mockLogger);
    await command.execute();

    expect(mockFileSystem.readFile).not.toHaveBeenCalled();
    expect(mockFileSystem.rm).not.toHaveBeenCalledWith(MOCK_SHIM_1, { force: true }); // Artifacts not deleted
    expect(mockFileSystem.rm).toHaveBeenCalledWith(MOCK_GENERATED_DIR, { recursive: true, force: true });
    expect(mockLogger.warn).toHaveBeenCalledWith(`Manifest file not found at ${MOCK_MANIFEST_PATH}.`);
    expect(mockLogger.info).toHaveBeenCalledWith(`Successfully deleted generated directory: ${MOCK_GENERATED_DIR}`);
  });

  it('should cleanup generated directory if manifest file is unparseable', async () => {
    (mockFileSystem.readFile as BunMock<typeof mockFileSystem.readFile>).mockResolvedValue('invalid json');

    const command = new CleanupCommand(mockAppConfig, mockFileSystem, mockLogger);
    await command.execute();

    expect(mockFileSystem.rm).not.toHaveBeenCalledWith(MOCK_SHIM_1, { force: true });
    expect(mockFileSystem.rm).toHaveBeenCalledWith(MOCK_GENERATED_DIR, { recursive: true, force: true });
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Error reading manifest file:'));
    expect(mockLogger.warn).toHaveBeenCalledWith('Proceeding to delete generated directory despite manifest error.');
  });

  it('should warn and skip non-existent artifacts listed in manifest', async () => {
    (mockFileSystem.exists as BunMock<typeof mockFileSystem.exists>).mockImplementation(async (p: string) => {
      if (p === MOCK_SHIM_1) return false; // Shim 1 does not exist
      return true;
    });
    (mockFileSystem.lstat as BunMock<typeof mockFileSystem.lstat>).mockImplementation(async (p: string) => {
      if (p === MOCK_SYMLINK_TARGET_1) throw new Error('not found'); // Symlink target does not exist
      return { isSymbolicLink: () => false, isFile: () => true, isDirectory: () => false, size: 1, mtime: new Date(), birthtime: new Date(), mode: 0o755 } as Stats;
    });


    const command = new CleanupCommand(mockAppConfig, mockFileSystem, mockLogger);
    await command.execute();

    expect(mockFileSystem.rm).not.toHaveBeenCalledWith(MOCK_SHIM_1, { force: true });
    expect(mockLogger.warn).toHaveBeenCalledWith(`  Shim not found, skipping: ${MOCK_SHIM_1}`);
    expect(mockFileSystem.rm).toHaveBeenCalledWith(MOCK_SHIM_2, { force: true }); // Shim 2 should still be deleted

    expect(mockFileSystem.rm).not.toHaveBeenCalledWith(MOCK_SYMLINK_TARGET_1, { force: true });
    expect(mockLogger.warn).toHaveBeenCalledWith(`  Symlink target not found, skipping: ${MOCK_SYMLINK_TARGET_1}`);

    expect(mockFileSystem.rm).toHaveBeenCalledWith(MOCK_GENERATED_DIR, { recursive: true, force: true });
  });

  it('should inform if generated directory does not exist', async () => {
    (mockFileSystem.exists as BunMock<typeof mockFileSystem.exists>).mockImplementation(async (p: string) => {
      if (p === MOCK_GENERATED_DIR) return false;
      if (p === MOCK_MANIFEST_PATH) return false; // Assume manifest also doesn't exist in this case
      return true;
    });

    const command = new CleanupCommand(mockAppConfig, mockFileSystem, mockLogger);
    await command.execute();

    expect(mockFileSystem.rm).not.toHaveBeenCalledWith(MOCK_GENERATED_DIR, { recursive: true, force: true });
    expect(mockLogger.info).toHaveBeenCalledWith(`Generated directory not found, skipping: ${MOCK_GENERATED_DIR}`);
  });

  it('should log error and continue if deleting a specific artifact fails', async () => {
    const deleteError = new Error('Permission denied');
    (mockFileSystem.rm as BunMock<typeof mockFileSystem.rm>).mockImplementation(async (p: string) => {
      if (p === MOCK_SHIM_1) throw deleteError;
    });

    const command = new CleanupCommand(mockAppConfig, mockFileSystem, mockLogger);
    await command.execute();

    expect(mockLogger.error).toHaveBeenCalledWith(`  Error deleting shim ${MOCK_SHIM_1}: ${String(deleteError)}`);
    expect(mockFileSystem.rm).toHaveBeenCalledWith(MOCK_SHIM_2, { force: true }); // Should still try to delete other artifacts
    expect(mockFileSystem.rm).toHaveBeenCalledWith(MOCK_SHELL_INIT, { force: true });
    expect(mockFileSystem.rm).toHaveBeenCalledWith(MOCK_SYMLINK_TARGET_1, { force: true });
    expect(mockFileSystem.rm).toHaveBeenCalledWith(MOCK_GENERATED_DIR, { recursive: true, force: true }); // And generated dir
  });

  it('should log error if deleting generated directory fails', async () => {
    const deleteError = new Error('Directory not empty');
    (mockFileSystem.rm as BunMock<typeof mockFileSystem.rm>).mockImplementation(async (p: string, opts?: { recursive?: boolean; force?: boolean }) => {
      if (p === MOCK_GENERATED_DIR && opts?.recursive) throw deleteError;
    });

    const command = new CleanupCommand(mockAppConfig, mockFileSystem, mockLogger);
    await command.execute();

    expect(mockLogger.error).toHaveBeenCalledWith(`Error deleting generated directory ${MOCK_GENERATED_DIR}: ${String(deleteError)}`);
    expect(mockLogger.info).toHaveBeenCalledWith('Cleanup complete.'); // Should still report completion
  });

  it('should not delete any files in dry run mode', async () => {
    const command = new CleanupCommand(mockAppConfig, mockFileSystem, mockLogger, true);
    await command.execute();

    // Verify fs.rm was not called for any artifacts
    expect(mockFileSystem.readFile).toHaveBeenCalledWith(MOCK_MANIFEST_PATH, 'utf-8');
    expect(mockFileSystem.rm).not.toHaveBeenCalled();

    // Verify appropriate log messages
    expect(mockLogger.info).toHaveBeenCalledWith('Starting dry run cleanup (no files will be removed)...');
    expect(mockLogger.info).toHaveBeenCalledWith('Deleting shims...');
    expect(mockLogger.info).toHaveBeenCalledWith(`  Would delete shim: ${MOCK_SHIM_1}`);
    expect(mockLogger.info).toHaveBeenCalledWith(`  Would delete shim: ${MOCK_SHIM_2}`);
    expect(mockLogger.info).toHaveBeenCalledWith('Deleting shell init file...');
    expect(mockLogger.info).toHaveBeenCalledWith(`  Would delete shell init: ${MOCK_SHELL_INIT}`);
    expect(mockLogger.info).toHaveBeenCalledWith('Deleting symlinks...');
    expect(mockLogger.info).toHaveBeenCalledWith(`  Would delete symlink: ${MOCK_SYMLINK_TARGET_1}`);
    expect(mockLogger.info).toHaveBeenCalledWith(`Would delete generated directory: ${MOCK_GENERATED_DIR}`);
    expect(mockLogger.info).toHaveBeenCalledWith('Dry run cleanup complete.');
  });
});
