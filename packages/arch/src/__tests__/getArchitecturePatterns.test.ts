import { describe, expect, it } from 'bun:test';
import type { SystemInfo } from '@dotfiles/core';
import { getArchitecturePatterns } from '../getArchitecturePatterns';

describe('getArchitecturePatterns', () => {
  it('should generate correct patterns for macOS ARM64', () => {
    const systemInfo: SystemInfo = {
      platform: 'darwin',
      arch: 'arm64',
      homeDir: '/home/test',
    };

    const patterns = getArchitecturePatterns(systemInfo);

    expect(patterns.system).toEqual([
      'apple',
      'darwin',
      'apple-darwin',
      'dmg',
      'mac',
      'macos',
      'mac-os',
      'osx',
      'os-x',
      'os64x',
    ]);
    expect(patterns.cpu).toEqual(['arm64', 'aarch64', 'aarch']);
    expect(patterns.variants).toEqual(['darwin']);
  });

  it('should generate correct patterns for macOS x86_64', () => {
    const systemInfo: SystemInfo = {
      platform: 'darwin',
      arch: 'x64',
      homeDir: '/home/test',
    };

    const patterns = getArchitecturePatterns(systemInfo);

    expect(patterns.system).toEqual([
      'apple',
      'darwin',
      'apple-darwin',
      'dmg',
      'mac',
      'macos',
      'mac-os',
      'osx',
      'os-x',
      'os64x',
    ]);
    expect(patterns.cpu).toEqual(['amd64', 'x86_64', 'x64', 'x86-64']);
    expect(patterns.variants).toEqual(['darwin']);
  });

  it('should generate correct patterns for Linux x86_64', () => {
    const systemInfo: SystemInfo = {
      platform: 'linux',
      arch: 'x86_64',
      homeDir: '/home/test',
    };

    const patterns = getArchitecturePatterns(systemInfo);

    expect(patterns.system).toEqual(['linux']);
    expect(patterns.cpu).toEqual(['amd64', 'x86_64', 'x64', 'x86-64']);
    expect(patterns.variants).toEqual(['musl', 'gnu', 'unknown-linux']);
  });

  it('should generate correct patterns for Linux ARM64', () => {
    const systemInfo: SystemInfo = {
      platform: 'linux',
      arch: 'aarch64',
      homeDir: '/home/test',
    };

    const patterns = getArchitecturePatterns(systemInfo);

    expect(patterns.system).toEqual(['linux']);
    expect(patterns.cpu).toEqual(['arm64', 'aarch64', 'aarch']);
    expect(patterns.variants).toEqual(['musl', 'gnu', 'unknown-linux']);
  });

  it('should generate correct patterns for Windows x64', () => {
    const systemInfo: SystemInfo = {
      platform: 'win32',
      arch: 'x64',
      homeDir: '/home/test',
    };

    const patterns = getArchitecturePatterns(systemInfo);

    expect(patterns.system).toEqual(['windows', 'win32', 'win64', 'pc-windows-gnu']);
    expect(patterns.cpu).toEqual(['amd64', 'x86_64', 'x64', 'x86-64']);
    expect(patterns.variants).toEqual(['mingw', 'msys', 'cygwin', 'pc-windows']);
  });

  it('should handle various x86 architecture variants', () => {
    const testCases = ['ia32', 'x86', 'i386', 'i486', 'i686', 'i786'];

    testCases.forEach((arch) => {
      const systemInfo: SystemInfo = {
        platform: 'linux',
        arch,
        homeDir: '/home/test',
      };

      const patterns = getArchitecturePatterns(systemInfo);
      expect(patterns.cpu).toEqual(['i386', 'i486', 'i686', 'i786', 'x86', 'ia32']);
    });
  });

  it('should handle ARM variants with eabihf', () => {
    const systemInfo: SystemInfo = {
      platform: 'linux',
      arch: 'armv6l',
      homeDir: '/home/test',
    };

    const patterns = getArchitecturePatterns(systemInfo);

    expect(patterns.cpu).toEqual(['armv6l', 'armv6', 'arm6']);
    expect(patterns.variants).toContain('eabihf');
  });

  it('should handle ARMv7/v8 variants', () => {
    const testCases = ['armv7l', 'armv8l'];

    testCases.forEach((arch) => {
      const systemInfo: SystemInfo = {
        platform: 'linux',
        arch,
        homeDir: '/home/test',
      };

      const patterns = getArchitecturePatterns(systemInfo);
      expect(patterns.cpu).toEqual(['armv7l', 'armv8l', 'armv7', 'armv8', 'arm7', 'arm8']);
      expect(patterns.variants).toContain('eabihf');
    });
  });

  it('should handle unknown platforms gracefully', () => {
    const systemInfo: SystemInfo = {
      platform: 'freebsd',
      arch: 'x64',
      homeDir: '/home/test',
    };

    const patterns = getArchitecturePatterns(systemInfo);

    expect(patterns.system).toEqual(['freebsd']);
    expect(patterns.cpu).toEqual(['amd64', 'x86_64', 'x64', 'x86-64']);
    expect(patterns.variants).toEqual(['freebsd']);
  });

  it('should handle unknown architectures gracefully', () => {
    const systemInfo: SystemInfo = {
      platform: 'linux',
      arch: 'riscv64',
      homeDir: '/home/test',
    };

    const patterns = getArchitecturePatterns(systemInfo);

    expect(patterns.system).toEqual(['linux']);
    expect(patterns.cpu).toEqual(['riscv64']);
    expect(patterns.variants).toEqual(['musl', 'gnu', 'unknown-linux']);
  });
});
