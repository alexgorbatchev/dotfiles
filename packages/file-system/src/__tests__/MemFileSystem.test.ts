import { beforeEach, describe, expect, it } from 'bun:test';
import type { DirectoryJSON } from 'memfs';
import type { IFileSystem } from '../IFileSystem';
import { createMemFileSystem } from '../testing-helpers/createMemFileSystem';

describe('MemFileSystem', () => {
  let fileSystem: IFileSystem; // Changed to IFileSystem
  const initialJsonBase: DirectoryJSON = {
    '/test.txt': 'hello world',
    '/data/file1.txt': 'data file 1',
    '/data/empty_dir': null,
  };

  beforeEach(async () => {
    // Create a fresh volume from base JSON using the helper
    const { fs } = await createMemFileSystem({
      initialVolumeJson: initialJsonBase,
    });
    fileSystem = fs;
    // Programmatically create the symlink to ensure it's correctly set up by memfs
    await fileSystem.symlink('/test.txt', '/link-to-text');
  });

  it('should readFile correctly', async () => {
    const content = await fileSystem.readFile('/test.txt');
    expect(content).toBe('hello world');
    const content2 = await fileSystem.readFile('/data/file1.txt', 'utf-8');
    expect(content2).toBe('data file 1');
  });

  it('readFile should throw for non-existent file', async () => {
    expect(fileSystem.readFile('/nonexistent.txt')).rejects.toThrow();
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
    expect(fileSystem.writeFile(newFilePath, newContent)).rejects.toThrow();
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
    expect(fileSystem.rm(dirPath)).rejects.toThrow(); // EISDIR or similar
  });

  it('rm should not throw for non-existent file if force is true', async () => {
    expect(fileSystem.rm('/nonexistent.txt', { force: true })).resolves.toBeUndefined();
  });

  it('rm should throw for non-existent file if force is false or undefined', async () => {
    expect(fileSystem.rm('/nonexistent.txt')).rejects.toThrow();
  });

  it('should remove an empty directory with rmdir', async () => {
    const dirPath = '/data/empty_dir';
    expect(await fileSystem.exists(dirPath)).toBe(true);
    await fileSystem.rmdir(dirPath);
    expect(await fileSystem.exists(dirPath)).toBe(false);
  });

  it('rmdir should throw for non-empty directory', async () => {
    const dirPath = '/data';
    expect(fileSystem.rmdir(dirPath)).rejects.toThrow();
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

  describe('rm symlink workaround', () => {
    it('should remove a symlink with rm', async () => {
      const target = '/test.txt';
      const linkPath = '/test-symlink';

      // Create symlink
      await fileSystem.symlink(target, linkPath);
      expect(await fileSystem.exists(linkPath)).toBe(true);

      const stats = await fileSystem.lstat(linkPath);
      expect(stats.isSymbolicLink()).toBe(true);

      // Remove symlink with rm
      await fileSystem.rm(linkPath);
      expect(await fileSystem.exists(linkPath)).toBe(false);

      // Verify target file still exists
      expect(await fileSystem.exists(target)).toBe(true);
    });

    it('should remove symlink before creating new one with same path', async () => {
      const oldTarget = '/test.txt';
      const newTarget = '/data/file1.txt';
      const linkPath = '/replaceable-link';

      // Create initial symlink
      await fileSystem.symlink(oldTarget, linkPath);
      const initialLink = await fileSystem.readlink(linkPath);
      expect(initialLink).toBe(oldTarget);

      // Remove old symlink
      await fileSystem.rm(linkPath, { force: true });

      // Create new symlink to different target
      await fileSystem.symlink(newTarget, linkPath);
      const newLink = await fileSystem.readlink(linkPath);
      expect(newLink).toBe(newTarget);
    });

    it('should handle rm with force option on non-existent symlink', async () => {
      const linkPath = '/non-existent-link';

      expect(await fileSystem.exists(linkPath)).toBe(false);

      // Should not throw with force option
      expect(fileSystem.rm(linkPath, { force: true })).resolves.toBeUndefined();
    });

    it('should remove broken symlink (pointing to non-existent target)', async () => {
      const target = '/will-be-deleted.txt';
      const linkPath = '/broken-link';

      // Create target and symlink
      await fileSystem.writeFile(target, 'content');
      await fileSystem.symlink(target, linkPath);

      // Verify symlink works
      const stats = await fileSystem.lstat(linkPath);
      expect(stats.isSymbolicLink()).toBe(true);

      // Delete the target to make symlink broken
      await fileSystem.rm(target);
      expect(await fileSystem.exists(target)).toBe(false);

      // Symlink path still exists (as a link) even though target is gone
      const brokenStats = await fileSystem.lstat(linkPath);
      expect(brokenStats.isSymbolicLink()).toBe(true);

      // Remove the broken symlink
      await fileSystem.rm(linkPath);
      const linkStillExists = await fileSystem.exists(linkPath);
      expect(linkStillExists).toBe(false);
    });
  });
});
