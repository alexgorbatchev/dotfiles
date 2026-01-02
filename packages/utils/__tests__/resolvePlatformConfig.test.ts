import { beforeEach, describe, expect, it } from 'bun:test';
import type { ToolConfig } from '@dotfiles/core';
import { Architecture, always, type ISystemInfo, Platform } from '@dotfiles/core';
import { resolvePlatformConfig } from '../src/resolvePlatformConfig';

describe('resolvePlatformConfig', () => {
  let baseToolConfig: ToolConfig;
  let macosSystemInfo: ISystemInfo;
  let linuxSystemInfo: ISystemInfo;
  let windowsSystemInfo: ISystemInfo;

  beforeEach(() => {
    baseToolConfig = {
      name: 'test-tool',
      version: 'latest',
      installationMethod: 'github-release',
      installParams: { repo: 'test/repo' },
      binaries: ['test-tool'],
      shellConfigs: {
        zsh: {
          scripts: [always`# Base zsh init`],
        },
        bash: {
          scripts: [always`# Base bash init`],
        },
      },
      symlinks: [{ source: './base.conf', target: '~/.base.conf' }],
    };

    macosSystemInfo = {
      platform: Platform.MacOS,
      arch: Architecture.Arm64,
      homeDir: '/Users/test',
    };

    linuxSystemInfo = {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
      homeDir: '/home/test',
    };

    windowsSystemInfo = {
      platform: Platform.Windows,
      arch: Architecture.X86_64,
      homeDir: 'C:\\Users\\test',
    };
  });

  describe('when no platform configs exist', () => {
    it('should return the original config unchanged', () => {
      const result = resolvePlatformConfig(baseToolConfig, macosSystemInfo);
      expect(result).toEqual(baseToolConfig);
    });

    it('should return the original config when platformConfigs is empty array', () => {
      const configWithEmptyPlatforms = { ...baseToolConfig, platformConfigs: [] };
      const result = resolvePlatformConfig(configWithEmptyPlatforms, macosSystemInfo);
      expect(result).toEqual(configWithEmptyPlatforms);
    });
  });

  describe('when platform configs exist but no matches', () => {
    it('should return original config when no platform matches', () => {
      const configWithPlatforms: ToolConfig = {
        ...baseToolConfig,
        platformConfigs: [
          {
            platforms: Platform.Linux,
            config: {
              shellConfigs: { zsh: { scripts: [always`# Linux specific`] } },
              binaries: ['linux-tool'],
            },
          },
        ],
      };

      const result = resolvePlatformConfig(configWithPlatforms, macosSystemInfo);

      // Should return config without platformConfigs property
      const expected = { ...baseToolConfig };
      expect(result).toEqual(expected);
      expect(result.platformConfigs).toBeUndefined();
    });
  });

  describe('when platform matches', () => {
    it('should merge macOS platform config with base config', () => {
      const configWithPlatforms: ToolConfig = {
        ...baseToolConfig,
        platformConfigs: [
          {
            platforms: Platform.MacOS,
            config: {
              shellConfigs: { zsh: { scripts: [always`# macOS specific`, always`export MACOS_VAR="true"`] } },
              binaries: ['macos-tool'],
              symlinks: [{ source: './macos.conf', target: '~/.macos.conf' }],
            },
          },
        ],
      };

      const result = resolvePlatformConfig(configWithPlatforms, macosSystemInfo);

      expect(result.shellConfigs?.zsh?.scripts).toEqual([
        always`# Base zsh init`,
        always`# macOS specific`,
        always`export MACOS_VAR="true"`,
      ]);
      expect(result.binaries).toEqual(['macos-tool']); // Platform overrides base
      expect(result.symlinks).toEqual([
        { source: './base.conf', target: '~/.base.conf' },
        { source: './macos.conf', target: '~/.macos.conf' },
      ]);
      expect(result.platformConfigs).toBeUndefined(); // Removed to avoid recursion
    });

    it('should merge Linux platform config with base config', () => {
      const configWithPlatforms: ToolConfig = {
        ...baseToolConfig,
        platformConfigs: [
          {
            platforms: Platform.Linux,
            config: {
              shellConfigs: {
                zsh: { scripts: [always`# Linux specific`] },
                bash: { scripts: [always`# Linux bash init`] },
              },
            },
          },
        ],
      };

      const result = resolvePlatformConfig(configWithPlatforms, linuxSystemInfo);

      expect(result.shellConfigs?.zsh?.scripts).toEqual([always`# Base zsh init`, always`# Linux specific`]);
      expect(result.shellConfigs?.bash?.scripts).toEqual([always`# Base bash init`, always`# Linux bash init`]);
      expect(result.binaries).toEqual(['test-tool']); // Unchanged from base
    });
  });

  describe('when multiple platform configs match', () => {
    it('should apply all matching platform configs in order', () => {
      const configWithMultiplePlatforms: ToolConfig = {
        ...baseToolConfig,
        platformConfigs: [
          {
            platforms: Platform.Unix, // Matches both Linux and macOS
            config: {
              shellConfigs: { zsh: { scripts: [always`# Unix common`] } },
            },
          },
          {
            platforms: Platform.MacOS,
            config: {
              shellConfigs: { zsh: { scripts: [always`# macOS specific`] } },
              binaries: ['macos-specific-tool'],
            },
          },
        ],
      };

      const result = resolvePlatformConfig(configWithMultiplePlatforms, macosSystemInfo);

      expect(result.shellConfigs?.zsh?.scripts).toEqual([
        always`# Base zsh init`,
        always`# Unix common`,
        always`# macOS specific`,
      ]);
      expect(result.binaries).toEqual(['macos-specific-tool']); // Last override wins
    });
  });

  describe('architecture-specific matching', () => {
    it('should match platform and architecture when both specified', () => {
      const configWithArchitecture: ToolConfig = {
        ...baseToolConfig,
        platformConfigs: [
          {
            platforms: Platform.MacOS,
            architectures: Architecture.Arm64,
            config: {
              shellConfigs: { zsh: { scripts: [always`# macOS ARM64 specific`] } },
              binaries: ['macos-arm64-tool'],
            },
          },
        ],
      };

      const result = resolvePlatformConfig(configWithArchitecture, macosSystemInfo);

      expect(result.shellConfigs?.zsh?.scripts).toEqual([always`# Base zsh init`, always`# macOS ARM64 specific`]);
      expect(result.binaries).toEqual(['macos-arm64-tool']);
    });

    it('should not match when architecture does not match', () => {
      const configWithArchitecture: ToolConfig = {
        ...baseToolConfig,
        platformConfigs: [
          {
            platforms: Platform.MacOS,
            architectures: Architecture.X86_64, // macosSystemInfo has arm64
            config: {
              shellConfigs: { zsh: { scripts: [always`# macOS x64 specific`] } },
            },
          },
        ],
      };

      const result = resolvePlatformConfig(configWithArchitecture, macosSystemInfo);

      // Should not match because architecture doesn't match
      expect(result.shellConfigs?.zsh?.scripts).toEqual([always`# Base zsh init`]);
    });

    it('should match platform when no architecture constraint specified', () => {
      const configWithoutArchitecture: ToolConfig = {
        ...baseToolConfig,
        platformConfigs: [
          {
            platforms: Platform.MacOS,
            // No architectures specified - should match all architectures
            config: {
              shellConfigs: { zsh: { scripts: [always`# macOS all architectures`] } },
            },
          },
        ],
      };

      const result = resolvePlatformConfig(configWithoutArchitecture, macosSystemInfo);

      expect(result.shellConfigs?.zsh?.scripts).toEqual([always`# Base zsh init`, always`# macOS all architectures`]);
    });
  });

  describe('bitwise platform matching', () => {
    it('should match combined platforms using bitwise OR', () => {
      const configWithCombinedPlatforms: ToolConfig = {
        ...baseToolConfig,
        platformConfigs: [
          {
            platforms: Platform.Linux | Platform.MacOS, // Unix platforms
            config: {
              shellConfigs: { zsh: { scripts: [always`# Unix platforms`] } },
            },
          },
        ],
      };

      // Test both Linux and macOS match
      const linuxResult = resolvePlatformConfig(configWithCombinedPlatforms, linuxSystemInfo);
      const macosResult = resolvePlatformConfig(configWithCombinedPlatforms, macosSystemInfo);
      const windowsResult = resolvePlatformConfig(configWithCombinedPlatforms, windowsSystemInfo);

      expect(linuxResult.shellConfigs?.zsh?.scripts).toEqual([always`# Base zsh init`, always`# Unix platforms`]);
      expect(macosResult.shellConfigs?.zsh?.scripts).toEqual([always`# Base zsh init`, always`# Unix platforms`]);
      expect(windowsResult.shellConfigs?.zsh?.scripts).toEqual([always`# Base zsh init`]); // Windows should not match
    });
  });

  describe('unknown platform/architecture handling', () => {
    it('should not match when system platform is unknown', () => {
      const unknownPlatformSystem: ISystemInfo = {
        platform: Platform.None,
        arch: Architecture.X86_64,
        homeDir: '/home/test',
      };

      const configWithPlatforms: ToolConfig = {
        ...baseToolConfig,
        platformConfigs: [
          {
            platforms: Platform.All,
            config: {
              shellConfigs: { zsh: { scripts: [always`# Should not match`] } },
            },
          },
        ],
      };

      const result = resolvePlatformConfig(configWithPlatforms, unknownPlatformSystem);
      expect(result.shellConfigs?.zsh?.scripts).toEqual([always`# Base zsh init`]); // No platform match
    });

    it('should not match when system architecture is unknown but architecture is specified', () => {
      const unknownArchSystem: ISystemInfo = {
        platform: Platform.MacOS,
        arch: Architecture.None, // Unknown architecture
        homeDir: '/Users/test',
      };

      const configWithArchitecture: ToolConfig = {
        ...baseToolConfig,
        platformConfigs: [
          {
            platforms: Platform.MacOS,
            architectures: Architecture.All,
            config: {
              shellConfigs: { zsh: { scripts: [always`# Should not match`] } },
            },
          },
        ],
      };

      const result = resolvePlatformConfig(configWithArchitecture, unknownArchSystem);
      expect(result.shellConfigs?.zsh?.scripts).toEqual([always`# Base zsh init`]); // No architecture match
    });
  });

  describe('property merging behavior', () => {
    it('should override scalar properties from platform config', () => {
      const configWithOverrides: ToolConfig = {
        ...baseToolConfig,
        version: '1.0.0',
        platformConfigs: [
          {
            platforms: Platform.MacOS,
            config: {
              version: '2.0.0-macos',
              binaries: ['test-tool-macos'],
            },
          },
        ],
      };

      const result = resolvePlatformConfig(configWithOverrides, macosSystemInfo);

      // Platform config overrides scalar properties
      expect(result.version).toBe('2.0.0-macos');
      expect(result.binaries).toEqual(['test-tool-macos']);
      // Base config properties remain unchanged
      expect(result.installationMethod).toBe('github-release');
      expect(result.installParams).toEqual({ repo: 'test/repo' });
    });

    it('should merge array properties (zshInit, bashInit, symlinks)', () => {
      const configWithArrays: ToolConfig = {
        ...baseToolConfig,
        shellConfigs: {
          ...baseToolConfig.shellConfigs,
          powershell: { scripts: [always`# Base PowerShell`] },
        },
        platformConfigs: [
          {
            platforms: Platform.MacOS,
            config: {
              shellConfigs: {
                zsh: { scripts: [always`# Platform zsh 1`, always`# Platform zsh 2`] },
                bash: { scripts: [always`# Platform bash`] },
                powershell: { scripts: [always`# Platform PowerShell`] },
              },
              symlinks: [
                { source: './platform1.conf', target: '~/.platform1.conf' },
                { source: './platform2.conf', target: '~/.platform2.conf' },
              ],
            },
          },
        ],
      };

      const result = resolvePlatformConfig(configWithArrays, macosSystemInfo);

      expect(result.shellConfigs?.zsh?.scripts).toEqual([
        always`# Base zsh init`,
        always`# Platform zsh 1`,
        always`# Platform zsh 2`,
      ]);
      expect(result.shellConfigs?.bash?.scripts).toEqual([always`# Base bash init`, always`# Platform bash`]);
      expect(result.shellConfigs?.powershell?.scripts).toEqual([
        always`# Base PowerShell`,
        always`# Platform PowerShell`,
      ]);
      expect(result.symlinks).toEqual([
        { source: './base.conf', target: '~/.base.conf' },
        { source: './platform1.conf', target: '~/.platform1.conf' },
        { source: './platform2.conf', target: '~/.platform2.conf' },
      ]);
    });
  });

  describe('when platform specifies different installation method', () => {
    it('should override base installation method with platform-specific one', () => {
      const configWithPlatformInstallMethod: ToolConfig = {
        name: 'eza',
        version: 'latest',
        installationMethod: 'manual',
        installParams: {},
        binaries: ['eza'],
        platformConfigs: [
          {
            platforms: Platform.MacOS,
            config: {
              installationMethod: 'cargo',
              installParams: {
                crateName: 'eza',
                binarySource: 'cargo-quickinstall',
                githubRepo: 'eza-community/eza',
              },
              binaries: ['eza'],
            },
          },
          {
            platforms: Platform.Linux,
            config: {
              installationMethod: 'github-release',
              installParams: {
                repo: 'eza-community/eza',
              },
              binaries: ['eza'],
            },
          },
        ],
      };

      const macosResult = resolvePlatformConfig(configWithPlatformInstallMethod, macosSystemInfo);
      expect(macosResult.installationMethod).toBe('cargo');
      expect(macosResult.installParams).toEqual({
        crateName: 'eza',
        binarySource: 'cargo-quickinstall',
        githubRepo: 'eza-community/eza',
      });

      const linuxResult = resolvePlatformConfig(configWithPlatformInstallMethod, linuxSystemInfo);
      expect(linuxResult.installationMethod).toBe('github-release');
      expect(linuxResult.installParams).toEqual({
        repo: 'eza-community/eza',
      });
    });
  });
});
