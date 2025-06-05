/**
 * @file generator/src/modules/file-system/__tests__/MemFileSystem.test.ts
 * @description Tests for the MemFileSystem implementation.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { MemFileSystem } from '../MemFileSystem';
import type { DirectoryJSON } from 'memfs';

describe('MemFileSystem', () => {
  let fileSystem: MemFileSystem; // Use MemFileSystem type for access to getVolume if needed
  const initialJsonBase: DirectoryJSON = {
    '/test.txt': 'hello world',
    '/data/file1.txt': 'data file 1',
    '/data/empty_dir': null,
  };

  beforeEach(() => {
    // Create a fresh volume from base JSON
    fileSystem = new MemFileSystem(initialJsonBase);
    // Programmatically create the symlink to ensure it's correctly set up by memfs
    const vol = (fileSystem as any).getVolume();
    vol.symlinkSync('/test.txt', '/link-to-text');
  });

  it('should readFile correctly', async () => {
    const content = await fileSystem.readFile('/test.txt');
    expect(content).toBe('hello world');
    const content2 = await fileSystem.readFile('/data/file1.txt', 'utf-8');
    expect(content2).toBe('data file 1');
  });

  it('readFile should throw for non-existent file', async () => {
    await expect(fileSystem.readFile('/nonexistent.txt')).rejects.toThrow();
  });

  it('should writeFile correctly', async () => {
    const newFilePath = '/newFile.txt';
    const newContent = 'new file content';
    await fileSystem.writeFile(newFilePath, newContent);
    const readContent = await fileSystem.readFile(newFilePath);
    expect(readContent).toBe(newContent);
  });

  it('writeFile should overwrite existing file', async () => {
    const existingFilePath = '/test.txt';
    const newContent = 'overwritten content';
    await fileSystem.writeFile(existingFilePath, newContent);
    const readContent = await fileSystem.readFile(existingFilePath);
    expect(readContent).toBe(newContent);
  });

  it('writeFile should throw if parent directory does not exist', async () => {
    const newFilePath = '/nonexistent_dir/newFile.txt';
    const newContent = 'content for non-existent dir';
    // Expect an error (typically ENOENT) when trying to write to a file
    // if its parent directory does not exist.
    await expect(fileSystem.writeFile(newFilePath, newContent)).rejects.toThrow();
  });

  it('should check existence correctly with exists', async () => {
    expect(await fileSystem.exists('/test.txt')).toBe(true);
    expect(await fileSystem.exists('/data/empty_dir')).toBe(true);
    expect(await fileSystem.exists('/nonexistent.txt')).toBe(false);
  });

  it('should create directory with mkdir', async () => {
    const newDirPath = '/newDir';
    await fileSystem.mkdir(newDirPath);
    expect(await fileSystem.exists(newDirPath)).toBe(true);
    const stat = await fileSystem.stat(newDirPath);
    expect(stat.isDirectory()).toBe(true);
  });

  it('mkdir should create directories recursively', async () => {
    const newDirPath = '/a/b/c';
    await fileSystem.mkdir(newDirPath, { recursive: true });
    expect(await fileSystem.exists(newDirPath)).toBe(true);
    const stat = await fileSystem.stat(newDirPath);
    expect(stat.isDirectory()).toBe(true);
  });

  it('should read directory contents with readdir', async () => {
    const entries = await fileSystem.readdir('/data');
    // Sort for consistent comparison as readdir order isn't guaranteed
    expect(entries.sort()).toEqual(['empty_dir', 'file1.txt'].sort());
  });

  it('should remove a file with rm', async () => {
    const filePath = '/test.txt';
    expect(await fileSystem.exists(filePath)).toBe(true);
    await fileSystem.rm(filePath);
    expect(await fileSystem.exists(filePath)).toBe(false);
  });

  it('should remove a directory with rm (recursive)', async () => {
    const dirPath = '/data';
    expect(await fileSystem.exists(dirPath)).toBe(true);
    await fileSystem.rm(dirPath, { recursive: true });
    expect(await fileSystem.exists(dirPath)).toBe(false);
  });

  it('rm should throw if trying to remove non-empty directory without recursive', async () => {
    const dirPath = '/data';
    await expect(fileSystem.rm(dirPath)).rejects.toThrow(); // EISDIR or similar
  });

  it('rm should not throw for non-existent file if force is true', async () => {
    await expect(fileSystem.rm('/nonexistent.txt', { force: true })).resolves.toBeUndefined();
  });

  it('rm should throw for non-existent file if force is false or undefined', async () => {
    await expect(fileSystem.rm('/nonexistent.txt')).rejects.toThrow();
  });

  it('should remove an empty directory with rmdir', async () => {
    const dirPath = '/data/empty_dir';
    expect(await fileSystem.exists(dirPath)).toBe(true);
    await fileSystem.rmdir(dirPath);
    expect(await fileSystem.exists(dirPath)).toBe(false);
  });

  it('rmdir should throw for non-empty directory', async () => {
    const dirPath = '/data';
    await expect(fileSystem.rmdir(dirPath)).rejects.toThrow();
  });

  it('should get file stats with stat', async () => {
    const stats = await fileSystem.stat('/test.txt');
    expect(stats).toBeDefined();
    expect(stats.isFile()).toBe(true);
    expect(stats.isDirectory()).toBe(false);
    expect(stats.size).toBe('hello world'.length);
  });

  it('should get directory stats with stat', async () => {
    const stats = await fileSystem.stat('/data');
    expect(stats).toBeDefined();
    expect(stats.isDirectory()).toBe(true);
  });

  it('should create and read symlink', async () => {
    const target = '/data/file1.txt';
    const linkPath = '/myLink';
    await fileSystem.symlink(target, linkPath);
    expect(await fileSystem.exists(linkPath)).toBe(true);
    const readTarget = await fileSystem.readlink(linkPath);
    expect(readTarget).toBe(target);
    const content = await fileSystem.readFile(linkPath); // Reading through the link
    expect(content).toBe('data file 1');
  });

  it('stat on symlink should return stats of the target file', async () => {
    // Assuming memfs.statSync (used by MemFileSystem.stat) resolves symlinks like node:fs.stat does.
    // The link '/link-to-text' points to '/test.txt', which is a file.
    const statsOfTarget = await fileSystem.stat('/link-to-text');

    expect(statsOfTarget.isFile()).toBe(true);
    expect(statsOfTarget.isSymbolicLink()).toBe(false); // It's the target's stats, not the link's
    expect(statsOfTarget.size).toBe('hello world'.length); // Size of /test.txt
  });

  it('should change permissions with chmod', async () => {
    const filePath = '/test.txt';
    const newMode = 0o777;
    await fileSystem.chmod(filePath, newMode);
    const updatedStats = await fileSystem.stat(filePath);
    // memfs mode might not be exactly what's set due to umask or internal handling,
    // but it should change from the default.
    // We check if the executable bits are set for user, group, other.
    expect(updatedStats.mode & 0o111).toBe(newMode & 0o111); // Check executable bits
  });

  it('should copy a file with copyFile', async () => {
    const srcPath = '/test.txt';
    const destPath = '/copy_of_test.txt';
    await fileSystem.copyFile(srcPath, destPath);
    expect(await fileSystem.exists(destPath)).toBe(true);
    const content = await fileSystem.readFile(destPath);
    expect(content).toBe('hello world');
  });

  it('should rename a file with rename', async () => {
    const oldPath = '/test.txt';
    const newPath = '/renamed_test.txt';
    await fileSystem.rename(oldPath, newPath);
    expect(await fileSystem.exists(oldPath)).toBe(false);
    expect(await fileSystem.exists(newPath)).toBe(true);
    const content = await fileSystem.readFile(newPath);
    expect(content).toBe('hello world');
  });

  it('should ensure directory exists with ensureDir (creates if not exists)', async () => {
    const dirPath = '/ensure/this/dir';
    expect(await fileSystem.exists(dirPath)).toBe(false);
    await fileSystem.ensureDir(dirPath);
    expect(await fileSystem.exists(dirPath)).toBe(true);
    const stats = await fileSystem.stat(dirPath);
    expect(stats.isDirectory()).toBe(true);
  });

  it('ensureDir does nothing if directory already exists', async () => {
    const dirPath = '/data'; // Exists from initialJson
    expect(await fileSystem.exists(dirPath)).toBe(true);
    await fileSystem.ensureDir(dirPath); // Should not throw
    expect(await fileSystem.exists(dirPath)).toBe(true);
  });
});
