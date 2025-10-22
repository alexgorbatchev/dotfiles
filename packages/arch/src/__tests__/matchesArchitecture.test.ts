import { describe, expect, it } from 'bun:test';
import type { ArchitectureRegex } from '@dotfiles/arch';
import { matchesArchitecture } from '@dotfiles/arch';

describe('matchesArchitecture', () => {
  const macosArm64Regex: ArchitectureRegex = {
    systemPattern: '(apple|darwin|macos)',
    cpuPattern: '(arm64|aarch64)',
    variantPattern: '(darwin)',
  };

  const linuxX64Regex: ArchitectureRegex = {
    systemPattern: '(linux)',
    cpuPattern: '(amd64|x86_64|x64)',
    variantPattern: '(musl|gnu)',
  };

  it('should match asset with correct system and CPU for macOS ARM64', () => {
    expect(matchesArchitecture('myapp-darwin-arm64.tar.gz', macosArm64Regex)).toBe(true);
    expect(matchesArchitecture('myapp-macos-aarch64.zip', macosArm64Regex)).toBe(true);
    expect(matchesArchitecture('myapp-apple-arm64.dmg', macosArm64Regex)).toBe(true);
  });

  it('should match asset with correct system and CPU for Linux x64', () => {
    expect(matchesArchitecture('myapp-linux-amd64.tar.gz', linuxX64Regex)).toBe(true);
    expect(matchesArchitecture('myapp-linux-x86_64.zip', linuxX64Regex)).toBe(true);
    expect(matchesArchitecture('tool-linux-x64.tar.gz', linuxX64Regex)).toBe(true);
  });

  it('should not match asset with wrong system', () => {
    expect(matchesArchitecture('myapp-windows-arm64.zip', macosArm64Regex)).toBe(false);
    expect(matchesArchitecture('myapp-linux-arm64.tar.gz', macosArm64Regex)).toBe(false);
  });

  it('should not match asset with wrong CPU', () => {
    expect(matchesArchitecture('myapp-darwin-x86_64.tar.gz', macosArm64Regex)).toBe(false);
    expect(matchesArchitecture('myapp-macos-amd64.zip', macosArm64Regex)).toBe(false);
  });

  it('should be case insensitive', () => {
    expect(matchesArchitecture('MyApp-Darwin-ARM64.tar.gz', macosArm64Regex)).toBe(true);
    expect(matchesArchitecture('MYAPP-LINUX-AMD64.tar.gz', linuxX64Regex)).toBe(true);
  });

  it('should match when patterns are empty (match all)', () => {
    const emptyRegex: ArchitectureRegex = {
      systemPattern: '',
      cpuPattern: '',
      variantPattern: '',
    };

    expect(matchesArchitecture('any-file-name.tar.gz', emptyRegex)).toBe(true);
  });

  it('should match when only system pattern is present', () => {
    const systemOnlyRegex: ArchitectureRegex = {
      systemPattern: '(darwin)',
      cpuPattern: '',
      variantPattern: '',
    };

    expect(matchesArchitecture('myapp-darwin-unknown.tar.gz', systemOnlyRegex)).toBe(true);
    expect(matchesArchitecture('myapp-linux-unknown.tar.gz', systemOnlyRegex)).toBe(false);
  });

  it('should match when only CPU pattern is present', () => {
    const cpuOnlyRegex: ArchitectureRegex = {
      systemPattern: '',
      cpuPattern: '(arm64)',
      variantPattern: '',
    };

    expect(matchesArchitecture('myapp-unknown-arm64.tar.gz', cpuOnlyRegex)).toBe(true);
    expect(matchesArchitecture('myapp-unknown-x64.tar.gz', cpuOnlyRegex)).toBe(false);
  });
});
