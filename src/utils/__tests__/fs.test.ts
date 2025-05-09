import { describe, it, expect, beforeEach } from 'bun:test';
import { Volume, type IFs } from 'memfs'; // Import Volume class and IFs instance type
import { createFs } from '../fs'; // The abstraction layer we're creating
import type { FileSystem } from '../fs'; // The interface it implements

// Removed duplicate import line

describe('FileSystem Abstraction', () => {
  let virtualFs: FileSystem;
  let vol: Volume; // Type vol as Volume instance

  beforeEach(() => {
    // Create a fresh volume for each test
    vol = Volume.fromJSON({
      '/existing-file.txt': 'hello world',
      '/existing-dir/file-in-dir.txt': 'content',
      '/existing-dir/subdir/nested.txt': 'nested content',
    });
    // Create the abstraction using the memfs volume instance
    virtualFs = createFs(vol); // No cast needed, createFs accepts IFs
  });

  it('should check if a file exists', async () => {
    expect(await virtualFs.exists('/existing-file.txt')).toBe(true);
    expect(await virtualFs.exists('/existing-dir')).toBe(true);
    expect(await virtualFs.exists('/non-existent-file.txt')).toBe(false);
  });

  it('should read a file', async () => {
    const content = await virtualFs.readFile('/existing-file.txt');
    expect(content).toBe('hello world');
  });

  it('should throw error when reading non-existent file', async () => {
    await expect(virtualFs.readFile('/non-existent-file.txt')).rejects.toThrow();
  });

  it('should write a file', async () => {
    const filePath = '/new-file.txt';
    const content = 'new content';
    await virtualFs.writeFile(filePath, content);
    expect(await virtualFs.readFile(filePath)).toBe(content);
    // Verify using the underlying volume directly
    expect(vol.readFileSync(filePath, 'utf-8')).toBe(content); // Use vol instance
  });

  it('should overwrite an existing file when writing', async () => {
    const filePath = '/existing-file.txt';
    const newContent = 'overwritten content';
    await virtualFs.writeFile(filePath, newContent);
    expect(await virtualFs.readFile(filePath)).toBe(newContent);
  });

  it('should create directories recursively when writing a file', async () => {
    const filePath = '/new-dir/subdir/deep-file.txt';
    const content = 'deep content';
    await virtualFs.writeFile(filePath, content);
    expect(await virtualFs.readFile(filePath)).toBe(content);
    expect(await virtualFs.exists('/new-dir/subdir')).toBe(true);
    // Verify using the underlying volume
    expect(vol.existsSync('/new-dir/subdir')).toBe(true); // Use vol instance
  });

  it('should remove a file', async () => {
    const filePath = '/existing-file.txt';
    expect(await virtualFs.exists(filePath)).toBe(true);
    await virtualFs.remove(filePath);
    expect(await virtualFs.exists(filePath)).toBe(false);
  });

  it('should remove a directory recursively', async () => {
    const dirPath = '/existing-dir';
    expect(await virtualFs.exists(dirPath)).toBe(true);
    expect(await virtualFs.exists('/existing-dir/file-in-dir.txt')).toBe(true);
    expect(await virtualFs.exists('/existing-dir/subdir/nested.txt')).toBe(true);
    await virtualFs.remove(dirPath);
    expect(await virtualFs.exists(dirPath)).toBe(false);
    expect(await virtualFs.exists('/existing-dir/file-in-dir.txt')).toBe(false);
    expect(await virtualFs.exists('/existing-dir/subdir/nested.txt')).toBe(false);
  });

  it('should throw error when removing non-existent path', async () => {
    await expect(virtualFs.remove('/non-existent')).rejects.toThrow();
  });

  it('should create a directory', async () => {
    const dirPath = '/create-this-dir';
    expect(await virtualFs.exists(dirPath)).toBe(false);
    await virtualFs.mkdir(dirPath);
    expect(await virtualFs.exists(dirPath)).toBe(true);
    // Verify using the underlying volume
    expect(vol.statSync(dirPath).isDirectory()).toBe(true); // Use vol instance
  });

  it('should create directories recursively', async () => {
    const dirPath = '/create/recursive/dirs';
    expect(await virtualFs.exists(dirPath)).toBe(false);
    await virtualFs.mkdir(dirPath);
    expect(await virtualFs.exists(dirPath)).toBe(true);
    expect(await virtualFs.exists('/create/recursive')).toBe(true);
    expect(await virtualFs.exists('/create')).toBe(true);
  });

  it('should not throw when creating an existing directory', async () => {
    const dirPath = '/existing-dir';
    expect(await virtualFs.exists(dirPath)).toBe(true);
    await expect(virtualFs.mkdir(dirPath)).resolves.toBeUndefined();
  });

  it('should check if a path is a directory', async () => {
    expect(await virtualFs.isDirectory('/existing-dir')).toBe(true);
    expect(await virtualFs.isDirectory('/existing-file.txt')).toBe(false);
    expect(await virtualFs.isDirectory('/non-existent')).toBe(false);
  });

  // Add tests for symlink creation if needed by the abstraction
  it('should create a symbolic link', async () => {
    const target = '/existing-file.txt';
    const linkPath = '/link-to-file';
    await virtualFs.symlink(target, linkPath);
    expect(await virtualFs.exists(linkPath)).toBe(true);
    // memfs specific check for symlinks
    expect(vol.lstatSync(linkPath).isSymbolicLink()).toBe(true); // Use vol instance
    expect(vol.readlinkSync(linkPath)).toBe(target); // Use vol instance
    // Reading the link should give the target's content
    expect(await virtualFs.readFile(linkPath)).toBe('hello world');
  });
});
