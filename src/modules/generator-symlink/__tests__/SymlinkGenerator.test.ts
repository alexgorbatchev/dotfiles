import type { IFileSystem } from '@modules/file-system';
import { createMemFileSystem } from '@testing-helpers';
import type { ToolConfig } from '@types';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { YamlConfig } from '@modules/config';
import {
  createYamlConfigFromObject,
  getDefaultConfigPath,
} from '@modules/config-loader';
import { MOCK_DEFAULT_CONFIG } from '@modules/config-loader/__tests__/fixtures';
import path from 'node:path';
import type { GenerateSymlinksOptions } from '../ISymlinkGenerator';
import { SymlinkGenerator } from '../SymlinkGenerator';

describe('SymlinkGenerator', () => {
  let fs: IFileSystem;
  let yamlConfig: YamlConfig;
  let symlinkGenerator: SymlinkGenerator;

  const MOCK_HOME_DIR = '/Users/testuser';
  const MOCK_PROJECT_ROOT = `${MOCK_HOME_DIR}/.dotfiles`;

  beforeEach(async () => {
    const { fs: memFs } = createMemFileSystem({
      initialVolumeJson: {
        [getDefaultConfigPath()]: MOCK_DEFAULT_CONFIG,
      },
    });
    fs = memFs;

    yamlConfig = await createYamlConfigFromObject(
      fs,
      {
        paths: {
          dotfilesDir: MOCK_PROJECT_ROOT,
          targetDir: MOCK_HOME_DIR,
        },
      },
      { platform: 'linux', arch: 'x64' },
      {},
    );

    symlinkGenerator = new SymlinkGenerator(fs, yamlConfig);
  });

  const createToolConfig = (symlinks: Array<{ source: string; target: string }>): ToolConfig => ({
    name: 'test-tool',
    binaries: ['test-tool'],
    version: '1.0.0',
    symlinks,
    installationMethod: 'none',
    installParams: undefined,
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

  it('should attempt symlink creation and return created status (simulating dry run with MemFS)', async () => {
    // SymlinkGenerator always attempts operations. MemFS simulates dry run by not hitting actual disk.
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'src/file.txt', target: '.target.txt' }]),
    };
    await fs.ensureDir(path.join(MOCK_PROJECT_ROOT, 'src'));
    await fs.writeFile(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'), 'source content');
    const targetPath = path.join(MOCK_HOME_DIR, '.target.txt');

    // No dryRun option passed
    const results = await symlinkGenerator.generate(toolConfigs, {});

    // MemFS will reflect the symlink creation
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

  it('should attempt backup/overwrite and return backed_up status (simulating dry run with MemFS)', async () => {
    const toolConfigs = {
      tool1: createToolConfig([{ source: 'src/file.txt', target: '.target.txt' }]),
    };
    await fs.ensureDir(path.join(MOCK_PROJECT_ROOT, 'src'));
    await fs.writeFile(path.join(MOCK_PROJECT_ROOT, 'src/file.txt'), 'source content');
    const targetPath = path.join(MOCK_HOME_DIR, '.target.txt');
    await fs.writeFile(targetPath, 'existing target content');
    const backupPath = `${targetPath}.bak`;

    // No dryRun option passed
    const options: GenerateSymlinksOptions = { overwrite: true, backup: true };
    const results = await symlinkGenerator.generate(toolConfigs, options);

    // MemFS will reflect backup and overwrite
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
      tool1: {
        name: 'test',
        binaries: [],
        version: '1.0.0',
        symlinks: undefined,
        installationMethod: 'none',
        installParams: undefined,
      },
    };
    const results = await symlinkGenerator.generate(toolConfigs as Record<string, ToolConfig>);
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
