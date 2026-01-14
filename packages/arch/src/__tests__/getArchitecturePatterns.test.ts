import { Architecture, type ISystemInfo, Platform } from '@dotfiles/core';
import { describe, expect, it } from 'bun:test';
import { getArchitecturePatterns } from '../getArchitecturePatterns';

describe('getArchitecturePatterns', () => {
  it('should generate correct patterns for macOS ARM64', () => {
    const systemInfo: ISystemInfo = {
      platform: Platform.MacOS,
      arch: Architecture.Arm64,
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
    const systemInfo: ISystemInfo = {
      platform: Platform.MacOS,
      arch: Architecture.X86_64,
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
    const systemInfo: ISystemInfo = {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
      homeDir: '/home/test',
    };

    const patterns = getArchitecturePatterns(systemInfo);

    expect(patterns.system).toEqual(['linux']);
    expect(patterns.cpu).toEqual(['amd64', 'x86_64', 'x64', 'x86-64']);
    expect(patterns.variants).toEqual(['musl', 'gnu', 'unknown-linux']);
  });

  it('should generate correct patterns for Linux ARM64', () => {
    const systemInfo: ISystemInfo = {
      platform: Platform.Linux,
      arch: Architecture.Arm64,
      homeDir: '/home/test',
    };

    const patterns = getArchitecturePatterns(systemInfo);

    expect(patterns.system).toEqual(['linux']);
    expect(patterns.cpu).toEqual(['arm64', 'aarch64', 'aarch']);
    expect(patterns.variants).toEqual(['musl', 'gnu', 'unknown-linux']);
  });

  it('should generate correct patterns for Windows x64', () => {
    const systemInfo: ISystemInfo = {
      platform: Platform.Windows,
      arch: Architecture.X86_64,
      homeDir: '/home/test',
    };

    const patterns = getArchitecturePatterns(systemInfo);

    expect(patterns.system).toEqual(['windows', 'win32', 'win64', 'pc-windows-gnu']);
    expect(patterns.cpu).toEqual(['amd64', 'x86_64', 'x64', 'x86-64']);
    expect(patterns.variants).toEqual(['mingw', 'msys', 'cygwin', 'pc-windows']);
  });

  it('should handle arm64 architecture', () => {
    const systemInfo: ISystemInfo = {
      platform: Platform.Linux,
      arch: Architecture.Arm64,
      homeDir: '/home/test',
    };

    const patterns = getArchitecturePatterns(systemInfo);
    expect(patterns.cpu).toEqual(['arm64', 'aarch64', 'aarch']);
  });

  it('should handle unknown platforms gracefully', () => {
    const systemInfo: ISystemInfo = {
      platform: Platform.None,
      arch: Architecture.X86_64,
      homeDir: '/home/test',
    };

    const patterns = getArchitecturePatterns(systemInfo);

    expect(patterns.system).toEqual([]);
    expect(patterns.cpu).toEqual(['amd64', 'x86_64', 'x64', 'x86-64']);
    expect(patterns.variants).toEqual([]);
  });

  it('should handle unknown architectures gracefully', () => {
    const systemInfo: ISystemInfo = {
      platform: Platform.Linux,
      arch: Architecture.None,
      homeDir: '/home/test',
    };

    const patterns = getArchitecturePatterns(systemInfo);

    expect(patterns.system).toEqual(['linux']);
    expect(patterns.cpu).toEqual([]);
    expect(patterns.variants).toEqual(['musl', 'gnu', 'unknown-linux']);
  });
});
