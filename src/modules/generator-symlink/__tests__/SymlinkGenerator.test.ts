import type { YamlConfig } from '@modules/config';
import { createYamlConfigFromObject } from '@modules/config-loader';
import { MOCK_DEFAULT_CONFIG_OBJ } from '@modules/config-loader/__tests__/fixtures';
import {
  TestLogger,
  createMemFileSystem,
  createTestDirectories,
  type MemFileSystemReturn,
} from '@testing-helpers';
import type { ToolConfig } from '@types';
import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import path from 'node:path';
import type { GenerateSymlinksOptions } from '../ISymlinkGenerator';
import { SymlinkGenerator } from '../SymlinkGenerator';

describe('SymlinkGenerator', () => {
  let mockFs: MemFileSystemReturn;
  let yamlConfig: YamlConfig;
  let symlinkGenerator: SymlinkGenerator;
  let logger: TestLogger;

  beforeEach(async () => {
    mock.restore();
    logger = new TestLogger();
    mockFs = await createMemFileSystem();
    yamlConfig = await createYamlConfigFromObject(logger, mockFs.fs, MOCK_DEFAULT_CONFIG_OBJ, { platform: 'linux', arch: 'x64', release: 'test', homeDir: '/home/test' }, {});
    symlinkGenerator = new SymlinkGenerator(logger, mockFs.fs, yamlConfig);

    await createTestDirectories(logger, mockFs.fs, { paths: yamlConfig.paths });
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
    const sourcePath = 'src/file.txt';
    const sourceFullPath = path.join(yamlConfig.paths.dotfilesDir, sourcePath);
    
    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: '.file.txt' }]),
    };
    await mockFs.addFiles({ [sourceFullPath]: 'content' });

    const results = await symlinkGenerator.generate(toolConfigs);
    const targetPath = path.join(yamlConfig.paths.targetDir, '.file.txt');
    expect(await mockFs.fs.exists(targetPath)).toBe(true);
    expect(await mockFs.fs.readlink(targetPath)).toBe(
      path.join(yamlConfig.paths.dotfilesDir, 'src/file.txt')
    );
    expect(results).toEqual([
      {
        sourcePath: path.join(yamlConfig.paths.dotfilesDir, 'src/file.txt'),
        targetPath,
        status: 'created',
      },
    ]);
  });

  it('should expand ~ in target path to home directory and return result', async () => {
    const sourcePath = 'src/another.txt';
    const sourceFullPath = path.join(yamlConfig.paths.dotfilesDir, sourcePath);
    
    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: '~/.another.txt' }]),
    };
    await mockFs.addFiles({ [sourceFullPath]: 'content' });

    const results = await symlinkGenerator.generate(toolConfigs);
    const targetPath = path.join(yamlConfig.paths.homeDir, '.another.txt');

    expect(await mockFs.fs.exists(targetPath)).toBe(true);
    expect(await mockFs.fs.readlink(targetPath)).toBe(
      path.join(yamlConfig.paths.dotfilesDir, 'src/another.txt')
    );

    expect(results).toEqual([
      {
        sourcePath: path.join(yamlConfig.paths.dotfilesDir, 'src/another.txt'),
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

    const targetPath = path.join(yamlConfig.paths.targetDir, '.nonexistent.txt');
    expect(await mockFs.fs.exists(targetPath)).toBe(false);
    expect(results).toEqual([
      {
        sourcePath: path.join(yamlConfig.paths.dotfilesDir, 'nonexistent.txt'),
        targetPath,
        status: 'skipped_source_missing',
      },
    ]);
  });

  it('should skip if target exists and overwrite is false (default), returning skipped_exists', async () => {
    const sourcePath = 'src/file.txt';
    const sourceFullPath = path.join(yamlConfig.paths.dotfilesDir, sourcePath);
    const targetPath = path.join(yamlConfig.paths.targetDir, '.target.txt');
    
    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: '.target.txt' }]),
    };
    await mockFs.addFiles({
      [sourceFullPath]: 'source content',
      [targetPath]: 'existing target content'
    });

    const results = await symlinkGenerator.generate(toolConfigs);

    expect(await mockFs.fs.readFile(targetPath)).toBe('existing target content'); // Should not be overwritten
    expect(results).toEqual([
      {
        sourcePath: path.join(yamlConfig.paths.dotfilesDir, 'src/file.txt'),
        targetPath,
        status: 'skipped_exists',
      },
    ]);
  });

  it('should overwrite if target exists and overwrite is true, returning updated_target', async () => {
    const sourcePath = 'src/file.txt';
    const sourceFullPath = path.join(yamlConfig.paths.dotfilesDir, sourcePath);
    const targetPath = path.join(yamlConfig.paths.targetDir, '.target.txt');
    
    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: '.target.txt' }]),
    };
    await mockFs.addFiles({
      [sourceFullPath]: 'source content',
      [targetPath]: 'existing target content'
    });

    const options: GenerateSymlinksOptions = { overwrite: true };
    const results = await symlinkGenerator.generate(toolConfigs, options);

    expect(await mockFs.fs.exists(targetPath)).toBe(true);
    expect(await mockFs.fs.readlink(targetPath)).toBe(
      path.join(yamlConfig.paths.dotfilesDir, 'src/file.txt')
    );
    expect(results).toEqual([
      {
        sourcePath: path.join(yamlConfig.paths.dotfilesDir, 'src/file.txt'),
        targetPath,
        status: 'updated_target', // Or 'created' if it considers the final link as new after delete
      },
    ]);
  });

  it('should backup and overwrite if target exists, overwrite is true, and backup is true, returning backed_up', async () => {
    const sourcePath = 'src/file.txt';
    const sourceFullPath = path.join(yamlConfig.paths.dotfilesDir, sourcePath);
    const targetPath = path.join(yamlConfig.paths.targetDir, '.target.txt');
    const backupPath = `${targetPath}.bak`;
    
    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: '.target.txt' }]),
    };
    await mockFs.addFiles({
      [sourceFullPath]: 'source content',
      [targetPath]: 'existing target content'
    });

    const options: GenerateSymlinksOptions = { overwrite: true, backup: true };
    const results = await symlinkGenerator.generate(toolConfigs, options);

    expect(await mockFs.fs.exists(backupPath)).toBe(true);
    expect(await mockFs.fs.readFile(backupPath)).toBe('existing target content');
    expect(await mockFs.fs.exists(targetPath)).toBe(true);
    expect(await mockFs.fs.readlink(targetPath)).toBe(
      path.join(yamlConfig.paths.dotfilesDir, 'src/file.txt')
    );
    expect(results).toEqual([
      {
        sourcePath: path.join(yamlConfig.paths.dotfilesDir, 'src/file.txt'),
        targetPath,
        status: 'backed_up',
      },
    ]);
  });

  it('should attempt symlink creation and return created status (simulating dry run with MemFS)', async () => {
    // SymlinkGenerator always attempts operations. MemFS simulates dry run by not hitting actual disk.
    const sourcePath = 'src/file.txt';
    const sourceFullPath = path.join(yamlConfig.paths.dotfilesDir, sourcePath);
    const targetPath = path.join(yamlConfig.paths.targetDir, '.target.txt');
    
    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: '.target.txt' }]),
    };
    await mockFs.addFiles({ [sourceFullPath]: 'source content' });

    // No dryRun option passed
    const results = await symlinkGenerator.generate(toolConfigs, {});

    // MemFS will reflect the symlink creation
    expect(await mockFs.fs.exists(targetPath)).toBe(true);
    expect(await mockFs.fs.readlink(targetPath)).toBe(
      path.join(yamlConfig.paths.dotfilesDir, 'src/file.txt')
    );
    expect(results).toEqual([
      {
        sourcePath: path.join(yamlConfig.paths.dotfilesDir, 'src/file.txt'),
        targetPath,
        status: 'created',
      },
    ]);
  });

  it('should attempt backup/overwrite and return backed_up status (simulating dry run with MemFS)', async () => {
    const sourcePath = 'src/file.txt';
    const sourceFullPath = path.join(yamlConfig.paths.dotfilesDir, sourcePath);
    const targetPath = path.join(yamlConfig.paths.targetDir, '.target.txt');
    const backupPath = `${targetPath}.bak`;
    
    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: '.target.txt' }]),
    };
    await mockFs.addFiles({
      [sourceFullPath]: 'source content',
      [targetPath]: 'existing target content'
    });

    // No dryRun option passed
    const options: GenerateSymlinksOptions = { overwrite: true, backup: true };
    const results = await symlinkGenerator.generate(toolConfigs, options);

    // MemFS will reflect backup and overwrite
    expect(await mockFs.fs.exists(backupPath)).toBe(true);
    expect(await mockFs.fs.readFile(backupPath)).toBe('existing target content');
    expect(await mockFs.fs.exists(targetPath)).toBe(true);
    expect(await mockFs.fs.readlink(targetPath)).toBe(
      path.join(yamlConfig.paths.dotfilesDir, 'src/file.txt')
    );
    expect(results).toEqual([
      {
        sourcePath: path.join(yamlConfig.paths.dotfilesDir, 'src/file.txt'),
        targetPath,
        status: 'backed_up',
      },
    ]);
  });

  it('should return empty array if toolConfigs is empty', async () => {
    const fsSpySymlink = spyOn(mockFs.fs, 'symlink');
    const results = await symlinkGenerator.generate({});
    expect(results).toEqual([]);
    expect(fsSpySymlink).not.toHaveBeenCalled();
    fsSpySymlink.mockRestore();
  });

  it('should return empty array if a toolConfig has no symlinks array', async () => {
    const fsSpySymlink = spyOn(mockFs.fs, 'symlink');
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
    const fsSpySymlink = spyOn(mockFs.fs, 'symlink');
    const toolConfigs = {
      tool1: createToolConfig([]),
    };
    const results = await symlinkGenerator.generate(toolConfigs);
    expect(results).toEqual([]);
    expect(fsSpySymlink).not.toHaveBeenCalled();
    fsSpySymlink.mockRestore();
  });

  it('should overwrite existing backup file if backup is true and return backed_up', async () => {
    const sourcePath = 'src/file.txt';
    const sourceFullPath = path.join(yamlConfig.paths.dotfilesDir, sourcePath);
    const targetPath = path.join(yamlConfig.paths.targetDir, '.target.txt');
    const backupPath = `${targetPath}.bak`;
    
    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: '.target.txt' }]),
    };
    await mockFs.addFiles({
      [sourceFullPath]: 'new source content',
      [targetPath]: 'original target content',
      [backupPath]: 'old backup content' // Pre-existing backup
    });

    const options: GenerateSymlinksOptions = { overwrite: true, backup: true };
    const results = await symlinkGenerator.generate(toolConfigs, options);

    expect(await mockFs.fs.readFile(backupPath)).toBe('original target content'); // New backup
    expect(await mockFs.fs.readlink(targetPath)).toBe(
      path.join(yamlConfig.paths.dotfilesDir, 'src/file.txt')
    );
    expect(results).toEqual([
      {
        sourcePath: path.join(yamlConfig.paths.dotfilesDir, 'src/file.txt'),
        targetPath,
        status: 'backed_up',
      },
    ]);
  });

  it('should correctly overwrite an existing directory if target is a directory and overwrite is true, returning updated_target', async () => {
    const sourcePath = 'src/file.txt';
    const sourceFullPath = path.join(yamlConfig.paths.dotfilesDir, sourcePath);
    const targetPath = path.join(yamlConfig.paths.targetDir, '.target_dir_as_file');
    const fileInTargetDir = path.join(targetPath, 'somefile.txt');
    
    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: '.target_dir_as_file' }]),
    };
    
    // Setup source file and target directory
    await mockFs.addFiles({ [sourceFullPath]: 'source content' });
    await mockFs.fs.mkdir(targetPath, { recursive: true });
    await mockFs.fs.writeFile(fileInTargetDir, 'content in dir');

    const options: GenerateSymlinksOptions = { overwrite: true };
    const results = await symlinkGenerator.generate(toolConfigs, options);

    // Directory should be removed and replaced by symlink
    expect(await mockFs.fs.exists(targetPath)).toBe(true);
    expect((await mockFs.fs.stat(targetPath)).isDirectory()).toBe(false); // No longer a directory
    expect(await mockFs.fs.readlink(targetPath)).toBe(
      path.join(yamlConfig.paths.dotfilesDir, 'src/file.txt')
    );
    expect(results).toEqual([
      {
        sourcePath: path.join(yamlConfig.paths.dotfilesDir, 'src/file.txt'),
        targetPath,
        status: 'updated_target',
      },
    ]);
  });

  it('should ensure target directory is created and return created', async () => {
    const sourcePath = 'src/file.txt';
    const sourceFullPath = path.join(yamlConfig.paths.dotfilesDir, sourcePath);
    
    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: 'newdir/.file.txt' }]),
    };
    await mockFs.addFiles({ [sourceFullPath]: 'content' });

    const results = await symlinkGenerator.generate(toolConfigs);

    const targetDir = path.join(yamlConfig.paths.targetDir, 'newdir');
    const targetPath = path.join(targetDir, '.file.txt');

    expect(await mockFs.fs.exists(targetDir)).toBe(true);
    expect((await mockFs.fs.stat(targetDir)).isDirectory()).toBe(true);
    expect(await mockFs.fs.exists(targetPath)).toBe(true);
    expect(await mockFs.fs.readlink(targetPath)).toBe(
      path.join(yamlConfig.paths.dotfilesDir, 'src/file.txt')
    );
    expect(results).toEqual([
      {
        sourcePath: path.join(yamlConfig.paths.dotfilesDir, 'src/file.txt'),
        targetPath,
        status: 'created',
      },
    ]);
  });

  it('should correctly resolve non-tilde prefixed relative target paths from homeDir and return created', async () => {
    const sourcePath = 'src/file.txt';
    const sourceFullPath = path.join(yamlConfig.paths.dotfilesDir, sourcePath);
    
    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: 'subdir/.configfile' }]),
    };
    await mockFs.addFiles({ [sourceFullPath]: 'content' });

    const results = await symlinkGenerator.generate(toolConfigs);

    const expectedTargetPath = path.join(yamlConfig.paths.targetDir, 'subdir/.configfile');
    expect(await mockFs.fs.exists(expectedTargetPath)).toBe(true);
    expect(await mockFs.fs.readlink(expectedTargetPath)).toBe(
      path.join(yamlConfig.paths.dotfilesDir, 'src/file.txt')
    );
    expect(results).toEqual([
      {
        sourcePath: path.join(yamlConfig.paths.dotfilesDir, 'src/file.txt'),
        targetPath: expectedTargetPath,
        status: 'created',
      },
    ]);
  });

  it('should skip if symlink already points to correct target', async () => {
    const sourcePath = 'src/file.txt';
    const sourceFullPath = path.join(yamlConfig.paths.dotfilesDir, sourcePath);
    const targetPath = '.file.txt';
    const expectedTargetPath = path.join(yamlConfig.paths.targetDir, targetPath);

    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: targetPath }]),
    };
    await mockFs.addFiles({ [sourceFullPath]: 'content' });
    
    // Pre-create the correct symlink
    await mockFs.fs.symlink(sourceFullPath, expectedTargetPath);

    const results = await symlinkGenerator.generate(toolConfigs, { overwrite: true });

    // Should not recreate the symlink - just skip with correct status
    expect(results).toEqual([
      {
        sourcePath: sourceFullPath,
        targetPath: expectedTargetPath,
        status: 'skipped_correct',
      },
    ]);

    // Verify symlink still points to the correct target
    expect(await mockFs.fs.readlink(expectedTargetPath)).toBe(sourceFullPath);
  });

  it('should return failed status if symlink creation fails', async () => {
    const sourcePath = 'src/file.txt';
    const sourceFullPath = path.join(yamlConfig.paths.dotfilesDir, sourcePath);

    const toolConfigs = {
      tool1: createToolConfig([{ source: sourcePath, target: '.file.txt' }]),
    };
    await mockFs.addFiles({ [sourceFullPath]: 'content', });

    mockFs.fs.symlink.mockImplementationOnce(() => {
      throw new Error('Symlink failed');
    });

    const results = await symlinkGenerator.generate(toolConfigs);

    expect(results).toEqual([
      {
        sourcePath: sourceFullPath,
        targetPath: path.join(yamlConfig.paths.targetDir, '.file.txt'),
        status: 'failed',
        error: expect.stringContaining('Failed to create symlink'),
      },
    ]);
  });
});
