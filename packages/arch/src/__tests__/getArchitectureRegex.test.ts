import { getArchitectureRegex } from '@dotfiles/arch';
import { Architecture, type ISystemInfo, Platform } from '@dotfiles/core';
import { describe, expect, it } from 'bun:test';

describe('getArchitectureRegex', () => {
  it('should combine pattern generation and regex creation for macOS ARM64', () => {
    const systemInfo: ISystemInfo = {
      platform: Platform.MacOS,
      arch: Architecture.Arm64,
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
    const systemInfo: ISystemInfo = {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
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
    const systemInfo: ISystemInfo = {
      platform: Platform.MacOS,
      arch: Architecture.X86_64,
      homeDir: '/home/test',
    };

    const regex = getArchitectureRegex(systemInfo);

    // Patterns should contain escaped dashes and other special chars
    expect(regex.systemPattern).toContain('apple-darwin');
    expect(regex.cpuPattern).toContain('x86-64');
  });
});
