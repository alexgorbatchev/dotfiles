import { createMemFileSystem, type IFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { beforeEach, describe, expect, it } from 'bun:test';
import { scanDirectoryForToolFiles } from '../scanDirectoryForToolFiles';

describe('scanDirectoryForToolFiles', () => {
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger({ name: 'test' });
  });

  it('returns empty array for empty directory', async () => {
    const { fs } = await createMemFileSystem({
      initialVolumeJson: {
        '/tools': null,
      },
    });

    const result = await scanDirectoryForToolFiles(fs, '/tools', logger);

    expect(result).toEqual([]);
  });

  it('finds tool files in root directory', async () => {
    const { fs } = await createMemFileSystem({
      initialVolumeJson: {
        '/tools/foo.tool.ts': 'content',
        '/tools/bar.tool.ts': 'content',
      },
    });

    const result = await scanDirectoryForToolFiles(fs, '/tools', logger);

    expect(result.toSorted()).toEqual(['/tools/bar.tool.ts', '/tools/foo.tool.ts']);
  });

  it('ignores non-tool files', async () => {
    const { fs } = await createMemFileSystem({
      initialVolumeJson: {
        '/tools/foo.tool.ts': 'content',
        '/tools/readme.md': 'content',
        '/tools/config.ts': 'content',
      },
    });

    const result = await scanDirectoryForToolFiles(fs, '/tools', logger);

    expect(result).toEqual(['/tools/foo.tool.ts']);
  });

  it('recursively scans subdirectories', async () => {
    const { fs } = await createMemFileSystem({
      initialVolumeJson: {
        '/tools/root.tool.ts': 'content',
        '/tools/nested/inner.tool.ts': 'content',
        '/tools/deep/nested/deep.tool.ts': 'content',
      },
    });

    const result = await scanDirectoryForToolFiles(fs, '/tools', logger);

    expect(result.toSorted()).toEqual([
      '/tools/deep/nested/deep.tool.ts',
      '/tools/nested/inner.tool.ts',
      '/tools/root.tool.ts',
    ]);
  });

  it('handles mixed structure with files and directories', async () => {
    const { fs } = await createMemFileSystem({
      initialVolumeJson: {
        '/tools/utilities/jq.tool.ts': 'content',
        '/tools/utilities/readme.md': 'content',
        '/tools/special/ssh/ssh.tool.ts': 'content',
        '/tools/core.tool.ts': 'content',
      },
    });

    const result = await scanDirectoryForToolFiles(fs, '/tools', logger);

    expect(result.toSorted()).toEqual([
      '/tools/core.tool.ts',
      '/tools/special/ssh/ssh.tool.ts',
      '/tools/utilities/jq.tool.ts',
    ]);
  });

  it('returns empty array when directory does not exist', async () => {
    const { fs } = await createMemFileSystem();

    const result = await scanDirectoryForToolFiles(fs, '/nonexistent', logger);

    expect(result).toEqual([]);
  });

  it('logs debug message when directory read fails', async () => {
    const { fs } = await createMemFileSystem();

    await scanDirectoryForToolFiles(fs, '/nonexistent', logger);

    logger.expect(['DEBUG'], ['test'], [], ['Failed to read /nonexistent']);
  });

  it('continues scanning when individual file stat fails', async () => {
    const { fs } = await createMemFileSystem({
      initialVolumeJson: {
        '/tools/good.tool.ts': 'content',
      },
    });

    // Override stat to fail for specific path
    const originalStat = fs.stat.bind(fs);
    const mockFs: IFileSystem = {
      ...fs,
      stat: async (filePath: string) => {
        if (filePath === '/tools/bad-file') {
          throw new Error('Permission denied');
        }
        return originalStat(filePath);
      },
      readdir: async (dirPath: string) => {
        const entries = await fs.readdir(dirPath);
        if (dirPath === '/tools') {
          return [...entries, 'bad-file'];
        }
        return entries;
      },
    };

    const result = await scanDirectoryForToolFiles(mockFs, '/tools', logger);

    expect(result).toEqual(['/tools/good.tool.ts']);
    logger.expect(['DEBUG'], ['test'], [], ['Failed to read /tools/bad-file']);
  });
});
