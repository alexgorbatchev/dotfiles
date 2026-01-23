import { createMemFileSystem, type IFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { beforeEach, describe, expect, it } from 'bun:test';
import { populateMemFsForDryRun } from '../populateMemFsForDryRun';

describe('populateMemFsForDryRun', () => {
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

    const result = await populateMemFsForDryRun(fs, '/tools', logger);

    expect(result).toEqual([]);
  });

  it('finds all files in root directory', async () => {
    const { fs } = await createMemFileSystem({
      initialVolumeJson: {
        '/tools/foo.tool.ts': 'content',
        '/tools/readme.md': 'content',
        '/tools/config.json': 'content',
      },
    });

    const result = await populateMemFsForDryRun(fs, '/tools', logger);

    expect(result.sort()).toEqual(['/tools/config.json', '/tools/foo.tool.ts', '/tools/readme.md']);
  });

  it('recursively scans subdirectories', async () => {
    const { fs } = await createMemFileSystem({
      initialVolumeJson: {
        '/tools/root.tool.ts': 'content',
        '/tools/nested/inner.ts': 'content',
        '/tools/deep/nested/deep.txt': 'content',
      },
    });

    const result = await populateMemFsForDryRun(fs, '/tools', logger);

    expect(result.sort()).toEqual(['/tools/deep/nested/deep.txt', '/tools/nested/inner.ts', '/tools/root.tool.ts']);
  });

  it('finds SSH tool supporting files in nested directories', async () => {
    const { fs } = await createMemFileSystem({
      initialVolumeJson: {
        '/tools/special/ssh/ssh.tool.ts': 'export default ...',
        '/tools/special/ssh/id_rsa': 'private key content',
        '/tools/special/ssh/id_rsa.pub': 'public key content',
        '/tools/special/ssh/config': 'Host *\n  IdentityFile ...',
      },
    });

    const result = await populateMemFsForDryRun(fs, '/tools', logger);

    expect(result.sort()).toEqual([
      '/tools/special/ssh/config',
      '/tools/special/ssh/id_rsa',
      '/tools/special/ssh/id_rsa.pub',
      '/tools/special/ssh/ssh.tool.ts',
    ]);
  });

  it('handles mixed structure with multiple tool directories', async () => {
    const { fs } = await createMemFileSystem({
      initialVolumeJson: {
        '/tools/core/bat.tool.ts': 'content',
        '/tools/development/nvim/nvim.tool.ts': 'content',
        '/tools/development/nvim/init.lua': 'vim config',
        '/tools/special/ssh/ssh.tool.ts': 'content',
        '/tools/special/ssh/id_rsa': 'key',
      },
    });

    const result = await populateMemFsForDryRun(fs, '/tools', logger);

    expect(result.sort()).toEqual([
      '/tools/core/bat.tool.ts',
      '/tools/development/nvim/init.lua',
      '/tools/development/nvim/nvim.tool.ts',
      '/tools/special/ssh/id_rsa',
      '/tools/special/ssh/ssh.tool.ts',
    ]);
  });

  it('returns empty array when directory does not exist', async () => {
    const { fs } = await createMemFileSystem();

    const result = await populateMemFsForDryRun(fs, '/nonexistent', logger);

    expect(result).toEqual([]);
  });

  it('logs debug message when directory read fails', async () => {
    const { fs } = await createMemFileSystem();

    await populateMemFsForDryRun(fs, '/nonexistent', logger);

    logger.expect(['DEBUG'], ['test'], [], ['Failed to read /nonexistent']);
  });

  it('continues scanning when individual file stat fails', async () => {
    const { fs } = await createMemFileSystem({
      initialVolumeJson: {
        '/tools/good.txt': 'content',
      },
    });

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

    const result = await populateMemFsForDryRun(mockFs, '/tools', logger);

    expect(result).toEqual(['/tools/good.txt']);
    logger.expect(['DEBUG'], ['test'], [], ['Failed to read /tools/bad-file']);
  });
});
