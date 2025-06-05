/**
 * @file generator/src/modules/generator-symlink/__tests__/SymlinkGenerator.test.ts
 * @description Unit tests for the SymlinkGenerator class.
 *
 * ## Development Plan
 *
 * ### Tasks
 * - [x] Define `GenerateSymlinksOptions` interface (in `ISymlinkGenerator.ts`).
 * - [x] Define `ISymlinkGenerator` interface (in `ISymlinkGenerator.ts`).
 * - [x] Implement `SymlinkGenerator` class (in `SymlinkGenerator.ts`).
 * - [x] Write tests for `SymlinkGenerator`.
 *   - [x] Test successful symlink creation.
 *   - [x] Test source file not found.
 *   - [x] Test target already exists (skip, overwrite, backup behaviors).
 *   - [x] Test path expansion (~ to home directory).
 *   - [x] Test `dryRun` behavior.
 *   - [x] Test with empty toolConfigs.
 *   - [x] Test with toolConfig with no symlinks.
 *   - [x] Test backup file already exists.
 *   - [x] Test target is a directory (for overwrite).
 * - [x] Create `index.ts` to export the interface and class.
 * - [x] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Ensure 100% test coverage for executable code.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import path from 'node:path';
import type { AppConfig, ToolConfig } from '../../../types';
import { MemFileSystem, type IFileSystem } from '../../file-system';
import { SymlinkGenerator } from '../SymlinkGenerator';
import type { GenerateSymlinksOptions } from '../ISymlinkGenerator';

describe('SymlinkGenerator', () => {
  let fs: IFileSystem;
  let appConfig: AppConfig;
  let symlinkGenerator: SymlinkGenerator;

  const MOCK_HOME_DIR = '/Users/testuser';
  const MOCK_PROJECT_ROOT = `${MOCK_HOME_DIR}/.dotfiles`;

  beforeEach(() => {
    fs = new MemFileSystem();
    appConfig = {
      dotfilesDir: MOCK_PROJECT_ROOT,
      targetDir: MOCK_HOME_DIR, // Typically user's home, used by other parts of AppConfig
      generatedDir: path.join(MOCK_PROJECT_ROOT, '.generated'),
      toolConfigDir: path.join(MOCK_PROJECT_ROOT, 'tool-configs'),
      debug: 'false',
      cacheEnabled: false,
      cacheDir: path.join(MOCK_PROJECT_ROOT, '.cache'),
      binariesDir: path.join(MOCK_PROJECT_ROOT, '.generated', 'binaries'),
      binDir: path.join(MOCK_PROJECT_ROOT, '.generated', 'bin'),
      zshInitDir: path.join(MOCK_PROJECT_ROOT, '.generated', 'zsh'),
      manifestPath: path.join(MOCK_PROJECT_ROOT, '.generated', 'manifest.json'),
      completionsDir: path.join(MOCK_PROJECT_ROOT, '.generated', 'completions'),
      // Optional fields can be omitted if not directly used by SymlinkGenerator
      // For SymlinkGenerator, only dotfilesDir is critical for its internal logic.
      // The rest are provided to satisfy the AppConfig type.
    };
    symlinkGenerator = new SymlinkGenerator(fs, appConfig);

    // Setup mock home and project root in MemFileSystem
    fs.mkdir(MOCK_HOME_DIR, { recursive: true });
    fs.mkdir(MOCK_PROJECT_ROOT, { recursive: true });
  });

  afterEach(() => {
    // Bun's mock.restoreAll() or specific mock.restore() might be needed
    // if mocks persist across tests in a way that causes issues.
    // For now, assuming Bun's test isolation handles this or individual mocks are managed.
  });

  const createToolConfig = (symlinks: Array<{ source: string; target: string }>): ToolConfig => ({
    name: 'test-tool',
    binaries: ['test-tool'],
    version: '1.0.0',
    symlinks,
  });

  it('should create a symlink successfully', async () => {
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'src/file.txt', target: '.file.txt' }]),
    };
    // Ensure directory exists before writing file into it
    await fs.ensureDir(path.join(MOCK_PROJECT_ROOT, 'src'));
    await fs.writeFile(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'), 'content');

    await symlinkGenerator.generate(toolConfigs);
    const targetPath = path.join(MOCK_HOME_DIR, '.file.txt');
    expect(await fs.exists(targetPath)).toBe(true);
    expect(await fs.readlink(targetPath)).toBe(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'));
  });

  it('should expand ~ in target path to home directory', async () => {
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'src/another.txt', target: '~/.another.txt' }]),
    };
    await fs.ensureDir(path.join(MOCK_PROJECT_ROOT, 'src'));
    await fs.writeFile(path.join(MOCK_PROJECT_ROOT, 'src/another.txt'), 'content');

    await symlinkGenerator.generate(toolConfigs);

    const targetPath = path.join(MOCK_HOME_DIR, '.another.txt');
    expect(await fs.exists(targetPath)).toBe(true);
    expect(await fs.readlink(targetPath)).toBe(path.join(MOCK_PROJECT_ROOT, 'src/another.txt'));
  });

  it('should skip symlink if source file does not exist', async () => {
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'nonexistent.txt', target: '.nonexistent.txt' }]),
    };

    await symlinkGenerator.generate(toolConfigs);

    const targetPath = path.join(MOCK_HOME_DIR, '.nonexistent.txt');
    expect(await fs.exists(targetPath)).toBe(false);
  });

  it('should skip if target exists and overwrite is false (default)', async () => {
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'src/file.txt', target: '.target.txt' }]),
    };
    await fs.ensureDir(path.join(MOCK_PROJECT_ROOT, 'src'));
    await fs.writeFile(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'), 'source content');
    const targetPath = path.join(MOCK_HOME_DIR, '.target.txt');
    await fs.writeFile(targetPath, 'existing target content');

    await symlinkGenerator.generate(toolConfigs);

    expect(await fs.readFile(targetPath)).toBe('existing target content'); // Should not be overwritten
  });

  it('should overwrite if target exists and overwrite is true', async () => {
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'src/file.txt', target: '.target.txt' }]),
    };
    await fs.ensureDir(path.join(MOCK_PROJECT_ROOT, 'src'));
    await fs.writeFile(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'), 'source content');
    const targetPath = path.join(MOCK_HOME_DIR, '.target.txt');
    await fs.writeFile(targetPath, 'existing target content');

    const options: GenerateSymlinksOptions = { overwrite: true };
    await symlinkGenerator.generate(toolConfigs, options);

    expect(await fs.exists(targetPath)).toBe(true);
    expect(await fs.readlink(targetPath)).toBe(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'));
  });

  it('should backup and overwrite if target exists, overwrite is true, and backup is true', async () => {
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'src/file.txt', target: '.target.txt' }]),
    };
    await fs.ensureDir(path.join(MOCK_PROJECT_ROOT, 'src'));
    await fs.writeFile(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'), 'source content');
    const targetPath = path.join(MOCK_HOME_DIR, '.target.txt');
    await fs.writeFile(targetPath, 'existing target content');
    const backupPath = `${targetPath}.bak`;

    const options: GenerateSymlinksOptions = { overwrite: true, backup: true };
    await symlinkGenerator.generate(toolConfigs, options);

    expect(await fs.exists(backupPath)).toBe(true);
    expect(await fs.readFile(backupPath)).toBe('existing target content');
    expect(await fs.exists(targetPath)).toBe(true);
    expect(await fs.readlink(targetPath)).toBe(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'));
  });

  it('should handle dryRun correctly, logging actions without performing them', async () => {
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'src/file.txt', target: '.target.txt' }]),
    };
    await fs.ensureDir(path.join(MOCK_PROJECT_ROOT, 'src'));
    await fs.writeFile(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'), 'source content');
    const targetPath = path.join(MOCK_HOME_DIR, '.target.txt');

    const options: GenerateSymlinksOptions = { dryRun: true };
    await symlinkGenerator.generate(toolConfigs, options);

    expect(await fs.exists(targetPath)).toBe(false); // Symlink should not be created
  });

  it('should handle dryRun with overwrite and backup correctly', async () => {
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'src/file.txt', target: '.target.txt' }]),
    };
    await fs.ensureDir(path.join(MOCK_PROJECT_ROOT, 'src'));
    await fs.writeFile(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'), 'source content');
    const targetPath = path.join(MOCK_HOME_DIR, '.target.txt');
    await fs.writeFile(targetPath, 'existing target content');
    const backupPath = `${targetPath}.bak`;

    const options: GenerateSymlinksOptions = { dryRun: true, overwrite: true, backup: true };
    await symlinkGenerator.generate(toolConfigs, options);

    expect(await fs.exists(backupPath)).toBe(false); // Backup should not be created
    expect(await fs.readFile(targetPath)).toBe('existing target content'); // Original target should remain
  });

  it('should do nothing if toolConfigs is empty', async () => {
    const fsSpySymlink = spyOn(fs, 'symlink');
    await symlinkGenerator.generate({});
    expect(fsSpySymlink).not.toHaveBeenCalled();
    fsSpySymlink.mockRestore();
  });

  it('should do nothing if a toolConfig has no symlinks array', async () => {
    const fsSpySymlink = spyOn(fs, 'symlink');
    const toolConfigs = {
      tool1: { name: 'test', binaries: [], version: '1.0.0', symlinks: undefined },
    };
    await symlinkGenerator.generate(toolConfigs);
    expect(fsSpySymlink).not.toHaveBeenCalled();
    fsSpySymlink.mockRestore();
  });

  it('should do nothing if a toolConfig has an empty symlinks array', async () => {
    const fsSpySymlink = spyOn(fs, 'symlink');
    const toolConfigs = {
      tool1: createToolConfig([]),
    };
    await symlinkGenerator.generate(toolConfigs);
    expect(fsSpySymlink).not.toHaveBeenCalled();
    fsSpySymlink.mockRestore();
  });

  it('should overwrite existing backup file if backup is true', async () => {
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'src/file.txt', target: '.target.txt' }]),
    };
    await fs.ensureDir(path.join(MOCK_PROJECT_ROOT, 'src'));
    await fs.writeFile(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'), 'new source content');
    const targetPath = path.join(MOCK_HOME_DIR, '.target.txt');
    await fs.writeFile(targetPath, 'original target content');
    const backupPath = `${targetPath}.bak`;
    await fs.writeFile(backupPath, 'old backup content'); // Pre-existing backup

    const options: GenerateSymlinksOptions = { overwrite: true, backup: true };
    await symlinkGenerator.generate(toolConfigs, options);

    expect(await fs.readFile(backupPath)).toBe('original target content'); // New backup
    expect(await fs.readlink(targetPath)).toBe(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'));
  });

  it('should correctly overwrite an existing directory if target is a directory and overwrite is true', async () => {
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'src/file.txt', target: '.target_dir_as_file' }]),
    };
    await fs.ensureDir(path.join(MOCK_PROJECT_ROOT, 'src'));
    await fs.writeFile(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'), 'source content');

    // Target is a directory
    const targetPath = path.join(MOCK_HOME_DIR, '.target_dir_as_file');
    await fs.mkdir(targetPath, { recursive: true });
    await fs.writeFile(path.join(targetPath, 'somefile.txt'), 'content in dir');

    const options: GenerateSymlinksOptions = { overwrite: true };
    await symlinkGenerator.generate(toolConfigs, options);

    // Directory should be removed and replaced by symlink
    expect(await fs.exists(targetPath)).toBe(true);
    expect((await fs.stat(targetPath)).isDirectory()).toBe(false); // No longer a directory
    expect(await fs.readlink(targetPath)).toBe(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'));
  });

  it('should ensure target directory is created', async () => {
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'src/file.txt', target: 'newdir/.file.txt' }]),
    };
    await fs.ensureDir(path.join(MOCK_PROJECT_ROOT, 'src'));
    await fs.writeFile(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'), 'content');

    await symlinkGenerator.generate(toolConfigs);

    const targetDir = path.join(MOCK_HOME_DIR, 'newdir');
    const targetPath = path.join(targetDir, '.file.txt');

    expect(await fs.exists(targetDir)).toBe(true);
    expect((await fs.stat(targetDir)).isDirectory()).toBe(true);
    expect(await fs.exists(targetPath)).toBe(true);
    expect(await fs.readlink(targetPath)).toBe(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'));
  });

  it('should correctly resolve non-tilde prefixed relative target paths from homeDir', async () => {
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'src/file.txt', target: 'subdir/.configfile' }]),
    };
    await fs.ensureDir(path.join(MOCK_PROJECT_ROOT, 'src'));
    await fs.writeFile(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'), 'content');

    await symlinkGenerator.generate(toolConfigs);

    const expectedTargetPath = path.join(MOCK_HOME_DIR, 'subdir/.configfile');
    expect(await fs.exists(expectedTargetPath)).toBe(true);
    expect(await fs.readlink(expectedTargetPath)).toBe(
      path.join(MOCK_PROJECT_ROOT, 'src/file.txt')
    );
  });
});
