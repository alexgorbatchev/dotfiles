import { describe, expect, it } from 'bun:test';
import type { SystemInfo } from '@dotfiles/schemas';
import { getArchitectureRegex } from '@dotfiles/arch';

describe('getArchitectureRegex', () => {
  it('should combine pattern generation and regex creation for macOS ARM64', () => {
    const systemInfo: SystemInfo = {
      platform: 'darwin',
      arch: 'arm64',
      homeDir: '/home/test',
    };

    const regex = getArchitectureRegex(systemInfo);

    expect(regex.systemPattern).toContain('apple');
    expect(regex.systemPattern).toContain('darwin');
    expect(regex.cpuPattern).toContain('arm64');
    expect(regex.cpuPattern).toContain('aarch64');
    expect(regex.variantPattern).toContain('darwin');
  });

  it('should combine pattern generation and regex creation for Linux x86_64', () => {
    const systemInfo: SystemInfo = {
      platform: 'linux',
      arch: 'x86_64',
      homeDir: '/home/test',
    };

    const regex = getArchitectureRegex(systemInfo);

    expect(regex.systemPattern).toContain('linux');
    expect(regex.cpuPattern).toContain('amd64');
    expect(regex.cpuPattern).toContain('x86_64');
    expect(regex.variantPattern).toContain('musl');
    expect(regex.variantPattern).toContain('gnu');
  });

  it('should escape special regex characters in patterns', () => {
    const systemInfo: SystemInfo = {
      platform: 'darwin',
      arch: 'x64',
      homeDir: '/home/test',
    };

    const regex = getArchitectureRegex(systemInfo);

    // Patterns should contain escaped dashes and other special chars
    expect(regex.systemPattern).toContain('apple-darwin');
    expect(regex.cpuPattern).toContain('x86-64');
  });
});
