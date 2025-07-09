import { describe, it, expect, mock } from 'bun:test';
import { createMemFileSystem } from '../createMemFileSystem';

describe('createMemFileSystem', () => {
  it('should create a functional IFileSystem instance without any options', async () => {
    const { fs } = createMemFileSystem();
    const testPath = '/test-dir';

    await fs.mkdir(testPath);
    const exists = await fs.exists(testPath);

    expect(exists).toBe(true);
  });

  it('should initialize the file system with the provided initialVolumeJson', async () => {
    const { fs } = createMemFileSystem({
      initialVolumeJson: {
        '/home/user/file.txt': 'hello world',
        '/home/user/another-dir': null,
      },
    });

    expect(await fs.exists('/home/user/file.txt')).toBe(true);
    expect(await fs.readFile('/home/user/file.txt', 'utf8')).toBe('hello world');
    expect(await fs.exists('/home/user/another-dir')).toBe(true);
    const stat = await fs.stat('/home/user/another-dir');
    expect(stat.isDirectory()).toBe(true);
  });

  it('should return spies that are connected to the underlying MemFileSystem methods', async () => {
    const { fs, spies } = createMemFileSystem();
    const filePath = '/test.txt';
    const fileContent = 'content';

    await fs.writeFile(filePath, fileContent);

    expect(spies.writeFile).toHaveBeenCalledTimes(1);
    expect(spies.writeFile).toHaveBeenCalledWith(filePath, fileContent);

    const content = await fs.readFile(filePath, 'utf8');
    expect(content).toBe(fileContent);
    expect(spies.readFile).toHaveBeenCalledTimes(1);
    expect(spies.readFile).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should use a provided mock implementation for a specific method', async () => {
    const readFileMock = mock(async (_path: string) => 'mocked content');

    const { fs, spies } = createMemFileSystem({
      readFile: readFileMock,
    });

    const content = await fs.readFile('/any/path', 'utf8');

    expect(content).toBe('mocked content');
    expect(readFileMock).toHaveBeenCalledTimes(1);
    expect(spies.readFile).toEqual(readFileMock); // The returned spy should be the mock itself
  });

  it('should handle a combination of mocks and spies correctly', async () => {
    const writeFileMock = mock(async () => {});
    const { fs, spies } = createMemFileSystem({
      initialVolumeJson: {
        '/existing.txt': 'exists',
      },
      writeFile: writeFileMock,
    });

    // Use the mocked method
    await fs.writeFile('/new-file.txt', 'some data');
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    expect(spies.writeFile).toEqual(writeFileMock);

    // Use a spied method
    const exists = await fs.exists('/existing.txt');
    expect(exists).toBe(true);
    expect(spies.exists).toHaveBeenCalledTimes(1);
    expect(spies.exists).toHaveBeenCalledWith('/existing.txt');
  });
});