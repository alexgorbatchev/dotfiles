import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { Stats } from 'node:fs';
import { constants as fsConstants, promises as fsPromises } from 'node:fs';
import { clearMockRegistry, createModuleMocker, setupTestCleanup } from '@rageltd/bun-test-utils';
import type { IFileSystem } from '../IFileSystem';
import { NodeFileSystem } from '../NodeFileSystem';

// Setup cleanup once per file
setupTestCleanup();

const mockModules = createModuleMocker();

// Create mocks for fs functions
const mockReadFile = mock(async () => 'mocked file content');
const mockWriteFile = mock(async () => undefined);
const mockAccess = mock(async () => undefined); // Default to success (exists)
const mockMkdir = mock(async () => undefined);
const mockReaddir = mock(async () => ['file1.txt', 'dir1']);
const mockRm = mock(async () => undefined);
const mockRmdir = mock(async () => undefined);
const mockStat = mock(async () => ({ isDirectory: () => false, isFile: () => true }) as Stats);
const mockSymlink = mock(async () => undefined);
const mockReadlink = mock(async () => 'mocked/target/path');
const mockChmod = mock(async () => undefined);
const mockCopyFile = mock(async () => undefined);
const mockRename = mock(async () => undefined);

describe('NodeFileSystem', () => {
  let fileSystem: IFileSystem;

  beforeEach(async () => {
    // Setup mock for node:fs module
    await mockModules.mock('node:fs', () => ({
      promises: {
        readFile: mockReadFile,
        writeFile: mockWriteFile,
        access: mockAccess,
        mkdir: mockMkdir,
        readdir: mockReaddir,
        rm: mockRm,
        rmdir: mockRmdir,
        stat: mockStat,
        symlink: mockSymlink,
        readlink: mockReadlink,
        chmod: mockChmod,
        copyFile: mockCopyFile,
        rename: mockRename,
      },
      constants: {
        F_OK: 0, // Actual value doesn't matter much for mock, just needs to be defined
      },
    }));

    fileSystem = new NodeFileSystem();
  });

  afterEach(() => {
    clearMockRegistry();
  });

  afterAll(() => {
    mockModules.restoreAll();
  });

  it('should call fsPromises.readFile for readFile', async () => {
    const filePath = 'test.txt';
    const content = await fileSystem.readFile(filePath);
    expect(fsPromises.readFile).toHaveBeenCalledWith(filePath, { encoding: 'utf8' });
    expect(content).toBe('mocked file content');
  });

  it('should call fsPromises.writeFile for writeFile', async () => {
    const filePath = 'test.txt';
    const fileContent = 'hello world';
    await fileSystem.writeFile(filePath, fileContent);
    expect(fsPromises.writeFile).toHaveBeenCalledWith(filePath, fileContent, { encoding: 'utf8' });
  });

  it('should call fsPromises.access for exists and return true if access succeeds', async () => {
    (fsPromises.access as any).mockResolvedValueOnce(undefined); // Ensure this call succeeds
    const filePath = 'test.txt';
    const result = await fileSystem.exists(filePath);
    expect(fsPromises.access).toHaveBeenCalledWith(filePath, fsConstants.F_OK);
    expect(result).toBe(true);
  });

  it('should call fsPromises.access for exists and return false if access fails', async () => {
    (fsPromises.access as any).mockRejectedValueOnce(new Error('File not found')); // Ensure this call fails
    const filePath = 'nonexistent.txt';
    const result = await fileSystem.exists(filePath);
    expect(fsPromises.access).toHaveBeenCalledWith(filePath, fsConstants.F_OK);
    expect(result).toBe(false);
  });

  it('should call fsPromises.mkdir for mkdir', async () => {
    const dirPath = 'new_dir';
    await fileSystem.mkdir(dirPath, { recursive: true });
    expect(fsPromises.mkdir).toHaveBeenCalledWith(dirPath, { recursive: true });
  });

  it('should call fsPromises.readdir for readdir', async () => {
    const dirPath = 'test_dir';
    const entries = await fileSystem.readdir(dirPath);
    expect(fsPromises.readdir).toHaveBeenCalledWith(dirPath);
    expect(entries).toEqual(['file1.txt', 'dir1']);
  });

  it('should call fsPromises.rm for rm', async () => {
    const filePath = 'file_to_remove.txt';
    await fileSystem.rm(filePath, { force: true });
    expect(fsPromises.rm).toHaveBeenCalledWith(filePath, { force: true });
  });

  it('should call fsPromises.rmdir for rmdir', async () => {
    const dirPath = 'dir_to_remove';
    await fileSystem.rmdir(dirPath, { recursive: true });
    expect(fsPromises.rmdir).toHaveBeenCalledWith(dirPath, { recursive: true });
  });

  it('should call fsPromises.stat for stat', async () => {
    const filePath = 'test.txt';
    const stats = await fileSystem.stat(filePath);
    expect(fsPromises.stat).toHaveBeenCalledWith(filePath);
    expect(stats.isFile()).toBe(true);
  });

  it('should call fsPromises.symlink for symlink', async () => {
    const target = '/target/file';
    const linkPath = '/link/path';
    await fileSystem.symlink(target, linkPath, 'file');
    expect(fsPromises.symlink).toHaveBeenCalledWith(target, linkPath, 'file');
  });

  it('should call fsPromises.readlink for readlink', async () => {
    const linkPath = '/link/path';
    const target = await fileSystem.readlink(linkPath);
    expect(fsPromises.readlink).toHaveBeenCalledWith(linkPath);
    expect(target).toBe('mocked/target/path');
  });

  it('should call fsPromises.chmod for chmod', async () => {
    const filePath = 'test.txt';
    const mode = 0o755;
    await fileSystem.chmod(filePath, mode);
    expect(fsPromises.chmod).toHaveBeenCalledWith(filePath, mode);
  });

  it('should call fsPromises.copyFile for copyFile', async () => {
    const src = 'source.txt';
    const dest = 'destination.txt';
    await fileSystem.copyFile(src, dest);
    expect(fsPromises.copyFile).toHaveBeenCalledWith(src, dest, undefined);
  });

  it('should call fsPromises.rename for rename', async () => {
    const oldPath = 'old_name.txt';
    const newPath = 'new_name.txt';
    await fileSystem.rename(oldPath, newPath);
    expect(fsPromises.rename).toHaveBeenCalledWith(oldPath, newPath);
  });

  it('should call fsPromises.mkdir for ensureDir', async () => {
    const dirPath = 'ensure_this_dir';
    await fileSystem.ensureDir(dirPath);
    expect(fsPromises.mkdir).toHaveBeenCalledWith(dirPath, { recursive: true });
  });
});
