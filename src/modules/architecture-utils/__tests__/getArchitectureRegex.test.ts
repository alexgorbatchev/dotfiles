import { beforeEach, describe, expect, it } from 'bun:test';
import type { TsLogger } from '@modules/logger';
import { TestLogger } from '@testing-helpers';
import type { ArchitecturePatterns, SystemInfo } from '@types'; // Updated import path
import {
  type ArchitectureRegex,
  createArchitectureRegex,
  getArchitecturePatterns,
  getArchitectureRegex,
  matchesArchitecture,
} from '../getArchitectureRegex';

describe('getArchitecturePatterns', () => {
  let logger: TsLogger;

  beforeEach(() => {
    logger = new TestLogger();
  });

  it('should generate correct patterns for macOS ARM64', () => {
    const systemInfo: SystemInfo = {
      platform: 'darwin',
      arch: 'arm64',
      homeDir: '/home/test',
    };

    const patterns = getArchitecturePatterns(logger, systemInfo);

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
    expect(patterns.cpu).toEqual(['arm64', 'aarch64', 'arm', 'aarch']);
    expect(patterns.variants).toEqual(['darwin']);
  });

  it('should generate correct patterns for macOS x86_64', () => {
    const systemInfo: SystemInfo = {
      platform: 'darwin',
      arch: 'x64',
      homeDir: '/home/test',
    };

    const patterns = getArchitecturePatterns(logger, systemInfo);

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

    const patterns = getArchitecturePatterns(logger, systemInfo);

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

    const patterns = getArchitecturePatterns(logger, systemInfo);

    expect(patterns.system).toEqual(['linux']);
    expect(patterns.cpu).toEqual(['arm64', 'aarch64', 'arm', 'aarch']);
    expect(patterns.variants).toEqual(['musl', 'gnu', 'unknown-linux']);
  });

  it('should generate correct patterns for Windows x64', () => {
    const systemInfo: SystemInfo = {
      platform: 'win32',
      arch: 'x64',
      homeDir: '/home/test',
    };

    const patterns = getArchitecturePatterns(logger, systemInfo);

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

      const patterns = getArchitecturePatterns(logger, systemInfo);
      expect(patterns.cpu).toEqual(['i386', 'i486', 'i686', 'i786', 'x86', 'ia32']);
    });
  });

  it('should handle ARM variants with eabihf', () => {
    const systemInfo: SystemInfo = {
      platform: 'linux',
      arch: 'armv6l',
      homeDir: '/home/test',
    };

    const patterns = getArchitecturePatterns(logger, systemInfo);

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

      const patterns = getArchitecturePatterns(logger, systemInfo);
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

    const patterns = getArchitecturePatterns(logger, systemInfo);

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

    const patterns = getArchitecturePatterns(logger, systemInfo);

    expect(patterns.system).toEqual(['linux']);
    expect(patterns.cpu).toEqual(['riscv64']);
    expect(patterns.variants).toEqual(['musl', 'gnu', 'unknown-linux']);
  });
});

describe('createArchitectureRegex', () => {
  let logger: TsLogger;

  beforeEach(() => {
    logger = new TestLogger();
  });
  it('should create proper regex patterns from architecture patterns', () => {
    const patterns: ArchitecturePatterns = {
      system: ['darwin', 'macos'],
      cpu: ['arm64', 'aarch64'],
      variants: ['darwin'],
    };

    const regex = createArchitectureRegex(logger, patterns);

    expect(regex.systemPattern).toBe('(darwin|macos)');
    expect(regex.cpuPattern).toBe('(arm64|aarch64)');
    expect(regex.variantPattern).toBe('(darwin)');
  });

  it('should handle empty pattern arrays', () => {
    const patterns: ArchitecturePatterns = {
      system: [],
      cpu: [],
      variants: [],
    };

    const regex = createArchitectureRegex(logger, patterns);

    expect(regex.systemPattern).toBe('');
    expect(regex.cpuPattern).toBe('');
    expect(regex.variantPattern).toBe('');
  });

  it('should escape special regex characters', () => {
    const patterns: ArchitecturePatterns = {
      system: ['x86-64', 'pc-windows-gnu'],
      cpu: ['amd64'],
      variants: ['gnu'],
    };

    const regex = createArchitectureRegex(logger, patterns);

    expect(regex.systemPattern).toBe('(x86-64|pc-windows-gnu)');
    expect(regex.cpuPattern).toBe('(amd64)');
    expect(regex.variantPattern).toBe('(gnu)');
  });

  it('should handle patterns with regex special characters', () => {
    const patterns: ArchitecturePatterns = {
      system: ['test.system', 'test+system'],
      cpu: ['test*cpu'],
      variants: ['test(variant)'],
    };

    const regex = createArchitectureRegex(logger, patterns);

    expect(regex.systemPattern).toBe('(test\\.system|test\\+system)');
    expect(regex.cpuPattern).toBe('(test\\*cpu)');
    expect(regex.variantPattern).toBe('(test\\(variant\\))');
  });
});

describe('getArchitectureRegex', () => {
  let logger: TsLogger;

  beforeEach(() => {
    logger = new TestLogger();
  });
  it('should combine pattern generation and regex creation', () => {
    const systemInfo: SystemInfo = {
      platform: 'darwin',
      arch: 'arm64',
      homeDir: '/home/test',
    };

    const regex = getArchitectureRegex(logger, systemInfo);

    expect(regex.systemPattern).toBe('(apple|darwin|apple-darwin|dmg|mac|macos|mac-os|osx|os-x|os64x)');
    expect(regex.cpuPattern).toBe('(arm64|aarch64|arm|aarch)');
    expect(regex.variantPattern).toBe('(darwin)');
  });

  it('should work for Linux systems', () => {
    const systemInfo: SystemInfo = {
      platform: 'linux',
      arch: 'x86_64',
      homeDir: '/home/test',
    };

    const regex = getArchitectureRegex(logger, systemInfo);

    expect(regex.systemPattern).toBe('(linux)');
    expect(regex.cpuPattern).toBe('(amd64|x86_64|x64|x86-64)');
    expect(regex.variantPattern).toBe('(musl|gnu|unknown-linux)');
  });

  it('should work for Windows systems', () => {
    const systemInfo: SystemInfo = {
      platform: 'win32',
      arch: 'x64',
      homeDir: '/home/test',
    };

    const regex = getArchitectureRegex(logger, systemInfo);

    expect(regex.systemPattern).toBe('(windows|win32|win64|pc-windows-gnu)');
    expect(regex.cpuPattern).toBe('(amd64|x86_64|x64|x86-64)');
    expect(regex.variantPattern).toBe('(mingw|msys|cygwin|pc-windows)');
  });
});

describe('matchesArchitecture', () => {
  let logger: TsLogger;

  beforeEach(() => {
    logger = new TestLogger();
  });
  const darwinArm64Regex: ArchitectureRegex = {
    systemPattern: '(apple|darwin|macos)',
    cpuPattern: '(arm64|aarch64)',
    variantPattern: '(darwin)',
  };

  const linuxX64Regex: ArchitectureRegex = {
    systemPattern: '(linux)',
    cpuPattern: '(amd64|x86_64|x64)',
    variantPattern: '(musl|gnu)',
  };

  it('should match Darwin ARM64 assets correctly', () => {
    const testCases = [
      { asset: 'tool-darwin-arm64.tar.gz', expected: true },
      { asset: 'tool-macos-aarch64.zip', expected: true },
      { asset: 'tool-apple-arm64.dmg', expected: true },
      { asset: 'tool-linux-arm64.tar.gz', expected: false },
      { asset: 'tool-darwin-x86_64.tar.gz', expected: false },
      { asset: 'tool-windows-arm64.exe', expected: false },
    ];

    testCases.forEach(({ asset, expected }) => {
      expect(matchesArchitecture(logger, asset, darwinArm64Regex)).toBe(expected);
    });
  });

  it('should match Linux x64 assets correctly', () => {
    const testCases = [
      { asset: 'tool-linux-x86_64.tar.gz', expected: true },
      { asset: 'tool-linux-amd64.zip', expected: true },
      { asset: 'tool-linux-x64.tar.gz', expected: true },
      { asset: 'tool-darwin-x86_64.tar.gz', expected: false },
      { asset: 'tool-linux-arm64.tar.gz', expected: false },
      { asset: 'tool-windows-x64.exe', expected: false },
    ];

    testCases.forEach(({ asset, expected }) => {
      expect(matchesArchitecture(logger, asset, linuxX64Regex)).toBe(expected);
    });
  });

  it('should handle case insensitive matching', () => {
    const testCases = ['Tool-Darwin-ARM64.TAR.GZ', 'TOOL-MACOS-AARCH64.ZIP', 'tool-APPLE-arm64.DMG'];

    testCases.forEach((asset) => {
      expect(matchesArchitecture(logger, asset, darwinArm64Regex)).toBe(true);
    });
  });

  it('should handle empty patterns gracefully', () => {
    const emptyRegex: ArchitectureRegex = {
      systemPattern: '',
      cpuPattern: '',
      variantPattern: '',
    };

    expect(matchesArchitecture(logger, 'any-asset-name.tar.gz', emptyRegex)).toBe(true);
  });

  it('should handle partial matches correctly', () => {
    const partialRegex: ArchitectureRegex = {
      systemPattern: '(linux)',
      cpuPattern: '',
      variantPattern: '',
    };

    expect(matchesArchitecture(logger, 'tool-linux-anything.tar.gz', partialRegex)).toBe(true);
    expect(matchesArchitecture(logger, 'tool-windows-anything.exe', partialRegex)).toBe(false);
  });

  it('should handle complex asset names', () => {
    const complexAssets = [
      'exa-linux-x86_64-v0.10.1.zip',
      'ripgrep-13.0.0-x86_64-apple-darwin.tar.gz',
      'bat-v0.18.3-x86_64-pc-windows-msvc.zip',
      'fd-v8.2.1-aarch64-apple-darwin.tar.gz',
    ];

    expect(matchesArchitecture(logger, complexAssets[0]!, linuxX64Regex)).toBe(true);
    expect(matchesArchitecture(logger, complexAssets[1]!, darwinArm64Regex)).toBe(false); // x86_64, not arm64
    expect(matchesArchitecture(logger, complexAssets[3]!, darwinArm64Regex)).toBe(true);
  });
});
