import { describe, expect, test } from 'bun:test';
import { createMemFileSystem } from '@dotfiles/file-system';
import type { IReplaceInFileMatch } from '../replaceInFile';
import { replaceInFile } from '../replaceInFile';

describe('replaceInFile', () => {
  test('replaces all matches in file mode even when regex is not global', async () => {
    const memFs = await createMemFileSystem({
      initialVolumeJson: {
        '/tmp/input.txt': 'a a a',
      },
    });

    await replaceInFile(memFs.fs.asIResolvedFileSystem, '/tmp/input.txt', /a/, 'b');

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

    await replaceInFile(
      memFs.fs.asIResolvedFileSystem,
      '/tmp/input.txt',
      /\d+/,
      async ({ substring }: IReplaceInFileMatch): Promise<string> => {
        const replacement: string = `(${substring})`;
        return replacement;
      }
    );

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

    await replaceInFile(memFs.fs.asIResolvedFileSystem, '/tmp/input.txt', /does-not-match/, 'x');

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

    await replaceInFile(memFs.fs.asIResolvedFileSystem, '/tmp/input.txt', /o/, '0', {
      mode: 'line',
    });

    const updated: string = await memFs.fs.readFile('/tmp/input.txt', 'utf8');
    expect(updated).toBe('hell0\r\nw0rld\r\n');
    expect(memFs.fs.writeFile).toHaveBeenCalledTimes(1);
  });
});
