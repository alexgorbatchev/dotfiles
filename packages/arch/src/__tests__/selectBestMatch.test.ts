import { describe, expect, it } from 'bun:test';
import type { SystemInfo } from '@dotfiles/schemas';
import { selectBestMatch } from '../selectBestMatch';

describe('selectBestMatch', () => {
  it('should return undefined when no assets match', () => {
    const systemInfo: SystemInfo = {
      platform: 'darwin',
      arch: 'arm64',
      homeDir: '/home/test',
    };

    const result = selectBestMatch(['tool-windows-x64.exe', 'tool-linux-amd64.tar.gz'], systemInfo);

    expect(result).toBeUndefined();
  });

  it('should return the only matching asset', () => {
    const systemInfo: SystemInfo = {
      platform: 'darwin',
      arch: 'arm64',
      homeDir: '/home/test',
    };

    const result = selectBestMatch(
      ['tool-darwin-arm64.tar.gz', 'tool-linux-amd64.tar.gz', 'tool-windows-x64.exe'],
      systemInfo
    );

    expect(result).toBe('tool-darwin-arm64.tar.gz');
  });

  it('should prefer musl variant when both musl and gnu are available for Linux', () => {
    const systemInfo: SystemInfo = {
      platform: 'linux',
      arch: 'x86_64',
      homeDir: '/home/test',
    };

    const result = selectBestMatch(
      [
        'tool-linux-x86_64-gnu.tar.gz',
        'tool-linux-x86_64-musl.tar.gz', // musl comes first in variant patterns
        'tool-darwin-arm64.tar.gz',
      ],
      systemInfo
    );

    // Should prefer musl (first in Linux variants: ['musl', 'gnu', 'unknown-linux'])
    expect(result).toBe('tool-linux-x86_64-musl.tar.gz');
  });

  it('should accept gnu variant if musl is not available', () => {
    const systemInfo: SystemInfo = {
      platform: 'linux',
      arch: 'x86_64',
      homeDir: '/home/test',
    };

    const result = selectBestMatch(
      ['tool-linux-x86_64-gnu.tar.gz', 'tool-darwin-arm64.tar.gz', 'tool-windows-x64.exe'],
      systemInfo
    );

    expect(result).toBe('tool-linux-x86_64-gnu.tar.gz');
  });

  it('should work with assets that have no variant info (most common case)', () => {
    const systemInfo: SystemInfo = {
      platform: 'linux',
      arch: 'x86_64',
      homeDir: '/home/test',
    };

    const result = selectBestMatch(
      ['fzf-0.66.0-linux_amd64.tar.gz', 'fzf-0.66.0-darwin_arm64.tar.gz', 'fzf-0.66.0-windows_amd64.zip'],
      systemInfo
    );

    expect(result).toBe('fzf-0.66.0-linux_amd64.tar.gz');
  });

  it('should return first match when multiple assets match without variants', () => {
    const systemInfo: SystemInfo = {
      platform: 'linux',
      arch: 'x86_64',
      homeDir: '/home/test',
    };

    // If somehow there are multiple matches with no variant differentiation,
    // return the first one (zinit behavior)
    const result = selectBestMatch(
      ['tool-linux-amd64.tar.gz', 'tool-linux-x86_64.tar.gz', 'tool-darwin-arm64.tar.gz'],
      systemInfo
    );

    expect(result).toBe('tool-linux-amd64.tar.gz');
  });

  it('should prefer mingw variant for Windows when multiple Windows variants exist', () => {
    const systemInfo: SystemInfo = {
      platform: 'win32',
      arch: 'x64',
      homeDir: '/home/test',
    };

    const result = selectBestMatch(
      [
        'tool-windows-x64-msys.zip',
        'tool-windows-x64-mingw.zip', // mingw comes first in Windows variants
        'tool-linux-amd64.tar.gz',
      ],
      systemInfo
    );

    // Should prefer mingw (first in Windows variants: ['mingw', 'msys', 'cygwin', 'pc-windows'])
    expect(result).toBe('tool-windows-x64-mingw.zip');
  });

  it('should handle ARM eabihf variant correctly', () => {
    const systemInfo: SystemInfo = {
      platform: 'linux',
      arch: 'armv7l',
      homeDir: '/home/test',
    };

    const result = selectBestMatch(
      ['tool-linux-armv7-eabihf.tar.gz', 'tool-linux-armv7.tar.gz', 'tool-linux-amd64.tar.gz'],
      systemInfo
    );

    // Should prefer eabihf variant for armv7l
    expect(result).toBe('tool-linux-armv7-eabihf.tar.gz');
  });
});
