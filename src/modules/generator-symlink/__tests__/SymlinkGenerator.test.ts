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
 *   - [x] Write tests for `SymlinkGenerator`.
 *     - [x] Test successful symlink creation and result.
 *     - [x] Test source file not found and result.
 *     - [x] Test target already exists (skip, overwrite, backup behaviors) and results.
 *     - [x] Test return value (`SymlinkOperationResult[]`).
 *   - [x] Test path expansion (~ to home directory).
 *   - [x] Test `dryRun` behavior.
 *   - [x] Test with empty toolConfigs.
 *   - [x] Test with toolConfig with no symlinks.
 *   - [x] Test backup file already exists.
 *   - [x] Test target is a directory (for overwrite).
 * - [x] Create `index.ts` to export the interface and class.
 * - [x] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [x] Update appConfig with `generatedArtifactsManifestPath`.
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
      githubApiCacheDir: path.join(MOCK_PROJECT_ROOT, '.generated', 'cache', 'github-api'), // Added
      generatedArtifactsManifestPath: path.join(
        MOCK_PROJECT_ROOT,
        '.generated/generated-manifest.json'
      ),
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

    const results = await symlinkGenerator.generate(toolConfigs);
    const targetPath = path.join(MOCK_HOME_DIR, '.file.txt');
    expect(await fs.exists(targetPath)).toBe(true);
    expect(await fs.readlink(targetPath)).toBe(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'));
    expect(results).toEqual([
      {
        sourcePath: path.join(MOCK_PROJECT_ROOT, 'src/file.txt'),
        targetPath,
        status: 'created',
      },
    ]);
  });

  it('should expand ~ in target path to home directory and return result', async () => {
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'src/another.txt', target: '~/.another.txt' }]),
    };
    await fs.ensureDir(path.join(MOCK_PROJECT_ROOT, 'src'));
    await fs.writeFile(path.join(MOCK_PROJECT_ROOT, 'src/another.txt'), 'content');

    const results = await symlinkGenerator.generate(toolConfigs);

    const targetPath = path.join(MOCK_HOME_DIR, '.another.txt');
    expect(await fs.exists(targetPath)).toBe(true);
    expect(await fs.readlink(targetPath)).toBe(path.join(MOCK_PROJECT_ROOT, 'src/another.txt'));
    expect(results).toEqual([
      {
        sourcePath: path.join(MOCK_PROJECT_ROOT, 'src/another.txt'),
        targetPath,
        status: 'created',
      },
    ]);
  });

  it('should skip symlink if source file does not exist and return skipped_source_missing', async () => {
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'nonexistent.txt', target: '.nonexistent.txt' }]),
    };

    const results = await symlinkGenerator.generate(toolConfigs);

    const targetPath = path.join(MOCK_HOME_DIR, '.nonexistent.txt');
    expect(await fs.exists(targetPath)).toBe(false);
    expect(results).toEqual([
      {
        sourcePath: path.join(MOCK_PROJECT_ROOT, 'nonexistent.txt'),
        targetPath,
        status: 'skipped_source_missing',
      },
    ]);
  });

  it('should skip if target exists and overwrite is false (default), returning skipped_exists', async () => {
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'src/file.txt', target: '.target.txt' }]),
    };
    await fs.ensureDir(path.join(MOCK_PROJECT_ROOT, 'src'));
    await fs.writeFile(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'), 'source content');
    const targetPath = path.join(MOCK_HOME_DIR, '.target.txt');
    await fs.writeFile(targetPath, 'existing target content');

    const results = await symlinkGenerator.generate(toolConfigs);

    expect(await fs.readFile(targetPath)).toBe('existing target content'); // Should not be overwritten
    expect(results).toEqual([
      {
        sourcePath: path.join(MOCK_PROJECT_ROOT, 'src/file.txt'),
        targetPath,
        status: 'skipped_exists',
      },
    ]);
  });

  it('should overwrite if target exists and overwrite is true, returning updated_target', async () => {
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'src/file.txt', target: '.target.txt' }]),
    };
    await fs.ensureDir(path.join(MOCK_PROJECT_ROOT, 'src'));
    await fs.writeFile(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'), 'source content');
    const targetPath = path.join(MOCK_HOME_DIR, '.target.txt');
    await fs.writeFile(targetPath, 'existing target content');

    const options: GenerateSymlinksOptions = { overwrite: true };
    const results = await symlinkGenerator.generate(toolConfigs, options);

    expect(await fs.exists(targetPath)).toBe(true);
    expect(await fs.readlink(targetPath)).toBe(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'));
    expect(results).toEqual([
      {
        sourcePath: path.join(MOCK_PROJECT_ROOT, 'src/file.txt'),
        targetPath,
        status: 'updated_target', // Or 'created' if it considers the final link as new after delete
      },
    ]);
  });

  it('should backup and overwrite if target exists, overwrite is true, and backup is true, returning backed_up', async () => {
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'src/file.txt', target: '.target.txt' }]),
    };
    await fs.ensureDir(path.join(MOCK_PROJECT_ROOT, 'src'));
    await fs.writeFile(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'), 'source content');
    const targetPath = path.join(MOCK_HOME_DIR, '.target.txt');
    await fs.writeFile(targetPath, 'existing target content');
    const backupPath = `${targetPath}.bak`;

    const options: GenerateSymlinksOptions = { overwrite: true, backup: true };
    const results = await symlinkGenerator.generate(toolConfigs, options);

    expect(await fs.exists(backupPath)).toBe(true);
    expect(await fs.readFile(backupPath)).toBe('existing target content');
    expect(await fs.exists(targetPath)).toBe(true);
    expect(await fs.readlink(targetPath)).toBe(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'));
    expect(results).toEqual([
      {
        sourcePath: path.join(MOCK_PROJECT_ROOT, 'src/file.txt'),
        targetPath,
        status: 'backed_up',
      },
    ]);
  });

  it('should handle dryRun correctly, logging actions without performing them, and return created status', async () => {
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'src/file.txt', target: '.target.txt' }]),
    };
    await fs.ensureDir(path.join(MOCK_PROJECT_ROOT, 'src'));
    await fs.writeFile(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'), 'source content');
    const targetPath = path.join(MOCK_HOME_DIR, '.target.txt');

    const options: GenerateSymlinksOptions = { dryRun: true };
    const results = await symlinkGenerator.generate(toolConfigs, options);

    expect(await fs.exists(targetPath)).toBe(false); // Symlink should not be created
    expect(results).toEqual([
      {
        sourcePath: path.join(MOCK_PROJECT_ROOT, 'src/file.txt'),
        targetPath,
        status: 'created', // Dry run assumes success for what would be done
      },
    ]);
  });

  it('should handle dryRun with overwrite and backup correctly, returning backed_up status', async () => {
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'src/file.txt', target: '.target.txt' }]),
    };
    await fs.ensureDir(path.join(MOCK_PROJECT_ROOT, 'src'));
    await fs.writeFile(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'), 'source content');
    const targetPath = path.join(MOCK_HOME_DIR, '.target.txt');
    await fs.writeFile(targetPath, 'existing target content');
    const backupPath = `${targetPath}.bak`;

    const options: GenerateSymlinksOptions = { dryRun: true, overwrite: true, backup: true };
    const results = await symlinkGenerator.generate(toolConfigs, options);

    expect(await fs.exists(backupPath)).toBe(false); // Backup should not be created
    expect(await fs.readFile(targetPath)).toBe('existing target content'); // Original target should remain
    expect(results).toEqual([
      {
        sourcePath: path.join(MOCK_PROJECT_ROOT, 'src/file.txt'),
        targetPath,
        status: 'backed_up', // Dry run assumes success for what would be done
      },
    ]);
  });

  it('should return empty array if toolConfigs is empty', async () => {
    const fsSpySymlink = spyOn(fs, 'symlink');
    const results = await symlinkGenerator.generate({});
    expect(results).toEqual([]);
    expect(fsSpySymlink).not.toHaveBeenCalled();
    fsSpySymlink.mockRestore();
  });

  it('should return empty array if a toolConfig has no symlinks array', async () => {
    const fsSpySymlink = spyOn(fs, 'symlink');
    const toolConfigs = {
      tool1: { name: 'test', binaries: [], version: '1.0.0', symlinks: undefined },
    };
    const results = await symlinkGenerator.generate(toolConfigs);
    expect(results).toEqual([]);
    expect(fsSpySymlink).not.toHaveBeenCalled();
    fsSpySymlink.mockRestore();
  });

  it('should return empty array if a toolConfig has an empty symlinks array', async () => {
    const fsSpySymlink = spyOn(fs, 'symlink');
    const toolConfigs = {
      tool1: createToolConfig([]),
    };
    const results = await symlinkGenerator.generate(toolConfigs);
    expect(results).toEqual([]);
    expect(fsSpySymlink).not.toHaveBeenCalled();
    fsSpySymlink.mockRestore();
  });

  it('should overwrite existing backup file if backup is true and return backed_up', async () => {
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
    const results = await symlinkGenerator.generate(toolConfigs, options);

    expect(await fs.readFile(backupPath)).toBe('original target content'); // New backup
    expect(await fs.readlink(targetPath)).toBe(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'));
    expect(results).toEqual([
      {
        sourcePath: path.join(MOCK_PROJECT_ROOT, 'src/file.txt'),
        targetPath,
        status: 'backed_up',
      },
    ]);
  });

  it('should correctly overwrite an existing directory if target is a directory and overwrite is true, returning updated_target', async () => {
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
    const results = await symlinkGenerator.generate(toolConfigs, options);

    // Directory should be removed and replaced by symlink
    expect(await fs.exists(targetPath)).toBe(true);
    expect((await fs.stat(targetPath)).isDirectory()).toBe(false); // No longer a directory
    expect(await fs.readlink(targetPath)).toBe(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'));
    expect(results).toEqual([
      {
        sourcePath: path.join(MOCK_PROJECT_ROOT, 'src/file.txt'),
        targetPath,
        status: 'updated_target',
      },
    ]);
  });

  it('should ensure target directory is created and return created', async () => {
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'src/file.txt', target: 'newdir/.file.txt' }]),
    };
    await fs.ensureDir(path.join(MOCK_PROJECT_ROOT, 'src'));
    await fs.writeFile(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'), 'content');

    const results = await symlinkGenerator.generate(toolConfigs);

    const targetDir = path.join(MOCK_HOME_DIR, 'newdir');
    const targetPath = path.join(targetDir, '.file.txt');

    expect(await fs.exists(targetDir)).toBe(true);
    expect((await fs.stat(targetDir)).isDirectory()).toBe(true);
    expect(await fs.exists(targetPath)).toBe(true);
    expect(await fs.readlink(targetPath)).toBe(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'));
    expect(results).toEqual([
      {
        sourcePath: path.join(MOCK_PROJECT_ROOT, 'src/file.txt'),
        targetPath,
        status: 'created',
      },
    ]);
  });

  it('should correctly resolve non-tilde prefixed relative target paths from homeDir and return created', async () => {
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'src/file.txt', target: 'subdir/.configfile' }]),
    };
    await fs.ensureDir(path.join(MOCK_PROJECT_ROOT, 'src'));
    await fs.writeFile(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'), 'content');

    const results = await symlinkGenerator.generate(toolConfigs);

    const expectedTargetPath = path.join(MOCK_HOME_DIR, 'subdir/.configfile');
    expect(await fs.exists(expectedTargetPath)).toBe(true);
    expect(await fs.readlink(expectedTargetPath)).toBe(
      path.join(MOCK_PROJECT_ROOT, 'src/file.txt')
    );
    expect(results).toEqual([
      {
        sourcePath: path.join(MOCK_PROJECT_ROOT, 'src/file.txt'),
        targetPath: expectedTargetPath,
        status: 'created',
      },
    ]);
  });

  it('should return failed status if symlink creation fails', async () => {
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'src/file.txt', target: '.file.txt' }]),
    };
    await fs.ensureDir(path.join(MOCK_PROJECT_ROOT, 'src'));
    await fs.writeFile(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'), 'content');

    spyOn(fs, 'symlink').mockRejectedValueOnce(new Error('Symlink failed'));

    const results = await symlinkGenerator.generate(toolConfigs);
    const targetPath = path.join(MOCK_HOME_DIR, '.file.txt');
    expect(results).toEqual([
      {
        sourcePath: path.join(MOCK_PROJECT_ROOT, 'src/file.txt'),
        targetPath,
        status: 'failed',
        error: expect.stringContaining('Symlink creation failed'),
      },
    ]);
  });
});
