import { describe, expect, test } from 'bun:test';
import { createMemFileSystem } from '@dotfiles/file-system';
import { replaceInFile } from '../replaceInFile';

describe('replaceInFile', () => {
  test('replaces all matches in file mode even when regex is not global', async () => {
    const memFs = await createMemFileSystem({
      initialVolumeJson: {
        '/tmp/input.txt': 'a a a',
      },
    });

    await replaceInFile({
      fileSystem: memFs.fs.asIFileSystem,
      filePath: '/tmp/input.txt',
      mode: 'file',
      from: /a/, // intentionally not /g
      to: 'b',
    });

    const updated: string = await memFs.fs.readFile('/tmp/input.txt', 'utf8');
    expect(updated).toBe('b b b');
    expect(memFs.fs.writeFile).toHaveBeenCalledTimes(1);
  });

  test('supports async replacement callbacks in file mode', async () => {
    const memFs = await createMemFileSystem({
      initialVolumeJson: {
        '/tmp/input.txt': 'x1y2z',
      },
    });

    await replaceInFile({
      fileSystem: memFs.fs.asIFileSystem,
      filePath: '/tmp/input.txt',
      mode: 'file',
      from: /\d+/,
      to: async (match: string): Promise<string> => {
        const replacement: string = `(${match})`;
        return replacement;
      },
    });

    const updated: string = await memFs.fs.readFile('/tmp/input.txt', 'utf8');
    expect(updated).toBe('x(1)y(2)z');
    expect(memFs.fs.writeFile).toHaveBeenCalledTimes(1);
  });

  test('does not write the file when there is no change', async () => {
    const memFs = await createMemFileSystem({
      initialVolumeJson: {
        '/tmp/input.txt': 'hello',
      },
    });

    await replaceInFile({
      fileSystem: memFs.fs.asIFileSystem,
      filePath: '/tmp/input.txt',
      mode: 'file',
      from: /does-not-match/,
      to: 'x',
    });

    const updated: string = await memFs.fs.readFile('/tmp/input.txt', 'utf8');
    expect(updated).toBe('hello');
    expect(memFs.fs.writeFile).toHaveBeenCalledTimes(0);
  });

  test('preserves per-line EOLs in line mode', async () => {
    const memFs = await createMemFileSystem({
      initialVolumeJson: {
        '/tmp/input.txt': 'hello\r\nworld\r\n',
      },
    });

    await replaceInFile({
      fileSystem: memFs.fs.asIFileSystem,
      filePath: '/tmp/input.txt',
      mode: 'line',
      from: /o/,
      to: '0',
    });

    const updated: string = await memFs.fs.readFile('/tmp/input.txt', 'utf8');
    expect(updated).toBe('hell0\r\nw0rld\r\n');
    expect(memFs.fs.writeFile).toHaveBeenCalledTimes(1);
  });
});
