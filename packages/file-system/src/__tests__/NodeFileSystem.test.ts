import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { Stats } from 'node:fs';
import type { IFileSystem } from '../IFileSystem';
import { NodeFileSystem } from '../NodeFileSystem';

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

const mockFsPromises = {
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  access: mockAccess,
  mkdir: mockMkdir,
  readdir: mockReaddir,
  rm: mockRm,
  rmdir: mockRmdir,
  stat: mockStat,
  lstat: mockStat,
  symlink: mockSymlink,
  readlink: mockReadlink,
  chmod: mockChmod,
  copyFile: mockCopyFile,
  rename: mockRename,
};

const mockConstants = {
  F_OK: 0,
};

describe('NodeFileSystem', () => {
  let fileSystem: IFileSystem;

  beforeEach(() => {
    fileSystem = new NodeFileSystem(
      mockFsPromises as unknown as typeof import('node:fs').promises,
      mockConstants as unknown as typeof import('node:fs').constants
    );
  });

  it('should call readFile with correct parameters', async () => {
    const filePath = 'test.txt';
    const content = await fileSystem.readFile(filePath);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, { encoding: 'utf8' });
    expect(content).toBe('mocked file content');
  });

  it('should call writeFile with correct parameters', async () => {
    const filePath = 'test.txt';
    const fileContent = 'hello world';
    await fileSystem.writeFile(filePath, fileContent);
    expect(mockWriteFile).toHaveBeenCalledWith(filePath, fileContent, { encoding: 'utf8' });
  });

  it('should return true when file exists', async () => {
    mockAccess.mockResolvedValueOnce(undefined);
    const filePath = 'test.txt';
    const result = await fileSystem.exists(filePath);
    expect(mockAccess).toHaveBeenCalledWith(filePath, 0);
    expect(result).toBe(true);
  });

  it('should return false when file does not exist', async () => {
    mockAccess.mockRejectedValueOnce(new Error('File not found'));
    const filePath = 'nonexistent.txt';
    const result = await fileSystem.exists(filePath);
    expect(mockAccess).toHaveBeenCalledWith(filePath, 0);
    expect(result).toBe(false);
  });

  it('should call mkdir with correct parameters', async () => {
    const dirPath = 'new_dir';
    await fileSystem.mkdir(dirPath, { recursive: true });
    expect(mockMkdir).toHaveBeenCalledWith(dirPath, { recursive: true });
  });

  it('should call readdir with correct parameters', async () => {
    const dirPath = 'test_dir';
    const entries = await fileSystem.readdir(dirPath);
    expect(mockReaddir).toHaveBeenCalledWith(dirPath);
    expect(entries).toEqual(['file1.txt', 'dir1']);
  });

  it('should call rm with correct parameters', async () => {
    const filePath = 'file_to_remove.txt';
    await fileSystem.rm(filePath, { force: true });
    expect(mockRm).toHaveBeenCalledWith(filePath, { force: true });
  });

  it('should call rmdir with correct parameters', async () => {
    const dirPath = 'dir_to_remove';
    await fileSystem.rmdir(dirPath);
    expect(mockRmdir).toHaveBeenCalledWith(dirPath);
  });

  it('should call rm when rmdir with recursive: true', async () => {
    const dirPath = 'dir_to_remove';
    await fileSystem.rmdir(dirPath, { recursive: true });
    expect(mockRm).toHaveBeenCalledWith(dirPath, { recursive: true, force: true });
  });

  it('should call stat with correct parameters', async () => {
    const filePath = 'test.txt';
    const stats = await fileSystem.stat(filePath);
    expect(mockStat).toHaveBeenCalledWith(filePath);
    expect(stats.isFile()).toBe(true);
  });

  it('should call symlink with correct parameters', async () => {
    const target = '/target/file';
    const linkPath = '/link/path';
    await fileSystem.symlink(target, linkPath, 'file');
    expect(mockSymlink).toHaveBeenCalledWith(target, linkPath, 'file');
  });

  it('should call readlink with correct parameters', async () => {
    const linkPath = '/link/path';
    const target = await fileSystem.readlink(linkPath);
    expect(mockReadlink).toHaveBeenCalledWith(linkPath);
    expect(target).toBe('mocked/target/path');
  });

  it('should call chmod with correct parameters', async () => {
    const filePath = 'test.txt';
    const mode = 0o755;
    await fileSystem.chmod(filePath, mode);
    expect(mockChmod).toHaveBeenCalledWith(filePath, mode);
  });

  it('should call copyFile with correct parameters', async () => {
    const src = 'source.txt';
    const dest = 'destination.txt';
    await fileSystem.copyFile(src, dest);
    expect(mockCopyFile).toHaveBeenCalledWith(src, dest, undefined);
  });

  it('should call rename with correct parameters', async () => {
    const oldPath = 'old_name.txt';
    const newPath = 'new_name.txt';
    await fileSystem.rename(oldPath, newPath);
    expect(mockRename).toHaveBeenCalledWith(oldPath, newPath);
  });

  it('should call mkdir for ensureDir with recursive option', async () => {
    const dirPath = 'ensure_this_dir';
    await fileSystem.ensureDir(dirPath);
    expect(mockMkdir).toHaveBeenCalledWith(dirPath, { recursive: true });
  });
});
