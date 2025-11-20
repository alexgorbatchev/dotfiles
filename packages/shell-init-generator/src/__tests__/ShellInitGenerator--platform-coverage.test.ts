import { beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import type { ProjectConfig } from '@dotfiles/config';
import type { ISystemInfo, ToolConfig } from '@dotfiles/core';
import { always, Platform } from '@dotfiles/core';
import { createMemFileSystem, type IFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createMockProjectConfig, createTestDirectories, type ITestDirectories } from '@dotfiles/testing-helpers';
import type { IGenerateShellInitOptions } from '../IShellInitGenerator';
import { ShellInitGenerator } from '../ShellInitGenerator';

describe('ShellInitGenerator - Platform Coverage Tests', () => {
  let mockFileSystem: IFileSystem;
  let mockProjectConfig: ProjectConfig;
  let generator: ShellInitGenerator;
  let logger: TestLogger;
  let testDirs: ITestDirectories;

  beforeEach(async () => {
    const { fs } = await createMemFileSystem({});
    mockFileSystem = fs;
    logger = new TestLogger();

    testDirs = await createTestDirectories(logger, mockFileSystem, { testName: 'shell-init-platform-coverage' });

    mockProjectConfig = await createMockProjectConfig({
      config: {
        paths: testDirs.paths,
      },
      filePath: path.join(testDirs.paths.dotfilesDir, 'config.yaml'),
      fileSystem: mockFileSystem,
      logger,
      systemInfo: { platform: 'darwin', arch: 'arm64', homeDir: testDirs.paths.homeDir },
      env: {},
    });

    generator = new ShellInitGenerator(logger, mockFileSystem, mockProjectConfig);
  });

  describe('multiple shell types with platform-specific code', () => {
    it('should generate platform-specific code for all shell types', async () => {
      const macosSystemInfo: ISystemInfo = {
        platform: 'darwin',
        arch: 'arm64',
        homeDir: '/Users/test',
      };

      const toolConfigs: Record<string, ToolConfig> = {
        'multi-shell-tool': {
          name: 'multi-shell-tool',
          version: 'latest',
          installationMethod: 'manual',
          shellConfigs: {
            zsh: { scripts: [always`# Base zsh`] },
            bash: { scripts: [always`# Base bash`] },
            powershell: { scripts: [always`# Base powershell`] },
          },
          platformConfigs: [
            {
              platforms: Platform.MacOS,
              config: {
                shellConfigs: {
                  zsh: { scripts: [always`# macOS zsh specific`] },
                  bash: { scripts: [always`# macOS bash specific`] },
                  powershell: { scripts: [always`# macOS powershell specific`] },
                },
                binaries: ['macos-tool'],
              },
            },
          ],
        },
      };

      const options: IGenerateShellInitOptions = {
        systemInfo: macosSystemInfo,
        shellTypes: ['zsh', 'bash', 'powershell'],
      };

      const result = await generator.generate(toolConfigs, options);

      expect(result).not.toBeNull();
      expect(result!.files.size).toBe(3);

      // Check zsh file
      const zshContent = await mockFileSystem.readFile(result!.files.get('zsh')!);
      expect(zshContent).toContain('# Base zsh');
      expect(zshContent).toContain('# macOS zsh specific');

      // Check bash file
      const bashContent = await mockFileSystem.readFile(result!.files.get('bash')!);
      expect(bashContent).toContain('# Base bash');
      expect(bashContent).toContain('# macOS bash specific');

      // Check powershell file
      const powershellContent = await mockFileSystem.readFile(result!.files.get('powershell')!);
      expect(powershellContent).toContain('# Base powershell');
      expect(powershellContent).toContain('# macOS powershell specific');
    });
  });

  describe('platform-specific symlinks processing', () => {
    it('should not directly process symlinks but should include them in resolved config', async () => {
      const macosSystemInfo: ISystemInfo = {
        platform: 'darwin',
        arch: 'arm64',
        homeDir: '/Users/test',
      };

      const toolConfigs: Record<string, ToolConfig> = {
        'symlink-tool': {
          name: 'symlink-tool',
          version: 'latest',
          installationMethod: 'manual',
          shellConfigs: { zsh: { scripts: [always`# Base init`] } },
          symlinks: [{ source: './base.conf', target: '~/.base.conf' }],
          platformConfigs: [
            {
              platforms: Platform.MacOS,
              config: {
                shellConfigs: { zsh: { scripts: [always`# macOS init`] } },
                symlinks: [{ source: './macos.conf', target: '~/.macos.conf' }],
              },
            },
          ],
        },
      };

      const options: IGenerateShellInitOptions = {
        systemInfo: macosSystemInfo,
        shellTypes: ['zsh'],
      };

      const result = await generator.generate(toolConfigs, options);

      expect(result).not.toBeNull();

      // Shell generator doesn't directly process symlinks, but they should be
      // merged into the resolved config for other generators to use
      const generatedContent = await mockFileSystem.readFile(result!.files.get('zsh')!);
      expect(generatedContent).toContain('# Base init');
      expect(generatedContent).toContain('# macOS init');

      // Symlinks aren't included in shell content, but the merging should work
      // (this would be tested in SymlinkGenerator tests instead)
    });
  });

  describe('environment variables and PATH modifications', () => {
    it('should properly categorize and hoist platform-specific env vars and PATH mods', async () => {
      const linuxSystemInfo: ISystemInfo = {
        platform: 'linux',
        arch: 'x64',
        homeDir: '/home/test',
      };

      const toolConfigs: Record<string, ToolConfig> = {
        'env-path-tool': {
          name: 'env-path-tool',
          version: 'latest',
          installationMethod: 'manual',
          shellConfigs: {
            zsh: {
              scripts: [
                always`export BASE_VAR="base_value"`,
                always`export PATH="/base/bin:$PATH"`,
                always`# Some other init code`,
              ],
            },
          },
          platformConfigs: [
            {
              platforms: Platform.Linux,
              config: {
                shellConfigs: {
                  zsh: {
                    scripts: [
                      always`export LINUX_SPECIFIC="linux_value"`,
                      always`export PATH="/linux/bin:$PATH"`,
                      always`alias linux-cmd="some-command"`,
                      always`fpath+="/linux/completions"`,
                    ],
                  },
                },
              },
            },
          ],
        },
      };

      const options: IGenerateShellInitOptions = {
        systemInfo: linuxSystemInfo,
        shellTypes: ['zsh'],
      };

      const result = await generator.generate(toolConfigs, options);

      expect(result).not.toBeNull();
      const generatedContent = await mockFileSystem.readFile(result!.files.get('zsh')!);

      // Should have always scripts section with both base and platform-specific
      expect(generatedContent).toContain('Always Scripts');
      expect(generatedContent).toContain('export BASE_VAR="base_value"');
      expect(generatedContent).toContain('export LINUX_SPECIFIC="linux_value"');

      // Should have PATH modifications section with both base and platform-specific
      expect(generatedContent).toContain('PATH Modifications');
      expect(generatedContent).toContain('export PATH="/base/bin:$PATH"');
      expect(generatedContent).toContain('export PATH="/linux/bin:$PATH"');
      expect(generatedContent).toContain('fpath+="/linux/completions"');

      // All scripts are now in the Always Scripts section
      expect(generatedContent).toContain('# Some other init code');
      expect(generatedContent).toContain('alias linux-cmd="some-command"');
    });
  });

  describe('real-world tool configurations', () => {
    it('should work with aerospace-like macOS-only tool', async () => {
      const macosSystemInfo: ISystemInfo = {
        platform: 'darwin',
        arch: 'arm64',
        homeDir: '/Users/test',
      };

      const linuxSystemInfo: ISystemInfo = {
        platform: 'linux',
        arch: 'x64',
        homeDir: '/home/test',
      };

      // Mimic the actual aerospace.tool.ts structure
      const toolConfigs: Record<string, ToolConfig> = {
        aerospace: {
          name: 'aerospace',
          version: 'latest',
          installationMethod: 'manual', // Base has no install method
          platformConfigs: [
            {
              platforms: Platform.MacOS,
              config: {
                binaries: ['aerospace'],
                symlinks: [{ source: './aerospace.toml', target: '~/.config/aerospace/aerospace.toml' }],
                // Aerospace might have shell init for keybindings or env vars
                shellConfigs: { zsh: { scripts: [always`# Aerospace window manager integration`] } },
              },
            },
          ],
        },
      };

      // Test on macOS - should include aerospace
      const macosOptions: IGenerateShellInitOptions = {
        systemInfo: macosSystemInfo,
        shellTypes: ['zsh'],
      };

      const macosResult = await generator.generate(toolConfigs, macosOptions);
      expect(macosResult).not.toBeNull();
      const macosContent = await mockFileSystem.readFile(macosResult!.files.get('zsh')!);
      expect(macosContent).toContain('# Aerospace window manager integration');

      // Test on Linux - should not include aerospace
      const linuxOptions: IGenerateShellInitOptions = {
        systemInfo: linuxSystemInfo,
        shellTypes: ['zsh'],
      };

      const linuxResult = await generator.generate(toolConfigs, linuxOptions);
      // Should still generate a file but without aerospace content
      if (linuxResult) {
        const linuxContent = await mockFileSystem.readFile(linuxResult.files.get('zsh')!);
        expect(linuxContent).not.toContain('# Aerospace window manager integration');
      } else {
        // Or might return null if no tools have any shell content for Linux
        expect(linuxResult).toBeNull();
      }
    });

    it('should work with eza-like multi-platform tool with different install methods', async () => {
      const macosSystemInfo: ISystemInfo = {
        platform: 'darwin',
        arch: 'arm64',
        homeDir: '/Users/test',
      };

      const linuxSystemInfo: ISystemInfo = {
        platform: 'linux',
        arch: 'x64',
        homeDir: '/home/test',
      };

      // Mimic the actual eza.tool.ts structure
      const toolConfigs: Record<string, ToolConfig> = {
        eza: {
          name: 'eza',
          version: 'latest',
          installationMethod: 'manual',
          shellConfigs: {
            zsh: {
              scripts: [
                always`# Base eza aliases`,
                always`alias ls="eza --group-directories-first --git"`,
                always`alias ll="eza -la --group-directories-first --git"`,
              ],
            },
          },
          platformConfigs: [
            {
              platforms: Platform.MacOS,
              config: {
                binaries: ['eza'],
                // macOS has custom installation via script/hooks
                shellConfigs: { zsh: { scripts: [always`# macOS specific eza setup`] } },
              },
            },
            {
              platforms: Platform.Linux,
              config: {
                binaries: ['eza'],
                shellConfigs: { zsh: { scripts: [always`# Linux specific eza setup`] } },
              },
            },
          ],
        },
      };

      // Test macOS version
      const macosOptions: IGenerateShellInitOptions = {
        systemInfo: macosSystemInfo,
        shellTypes: ['zsh'],
      };

      const macosResult = await generator.generate(toolConfigs, macosOptions);
      expect(macosResult).not.toBeNull();
      const macosContent = await mockFileSystem.readFile(macosResult!.files.get('zsh')!);

      expect(macosContent).toContain('# Base eza aliases');
      expect(macosContent).toContain('alias ls="eza --group-directories-first --git"');
      expect(macosContent).toContain('# macOS specific eza setup');
      expect(macosContent).not.toContain('# Linux specific eza setup');

      // Test Linux version
      const linuxOptions: IGenerateShellInitOptions = {
        systemInfo: linuxSystemInfo,
        shellTypes: ['zsh'],
      };

      const linuxResult = await generator.generate(toolConfigs, linuxOptions);
      expect(linuxResult).not.toBeNull();
      const linuxContent = await mockFileSystem.readFile(linuxResult!.files.get('zsh')!);

      expect(linuxContent).toContain('# Base eza aliases');
      expect(linuxContent).toContain('alias ls="eza --group-directories-first --git"');
      expect(linuxContent).toContain('# Linux specific eza setup');
      expect(linuxContent).not.toContain('# macOS specific eza setup');
    });
  });

  describe('edge cases and error conditions', () => {
    it('should handle empty platform-specific shell init arrays', async () => {
      const macosSystemInfo: ISystemInfo = {
        platform: 'darwin',
        arch: 'arm64',
        homeDir: '/Users/test',
      };

      const toolConfigs: Record<string, ToolConfig> = {
        'empty-platform-tool': {
          name: 'empty-platform-tool',
          version: 'latest',
          installationMethod: 'manual',
          shellConfigs: { zsh: { scripts: [always`# Base init`] } },
          platformConfigs: [
            {
              platforms: Platform.MacOS,
              config: {
                shellConfigs: { zsh: { scripts: [] } }, // Empty array
                binaries: ['empty-tool'],
              },
            },
          ],
        },
      };

      const options: IGenerateShellInitOptions = {
        systemInfo: macosSystemInfo,
        shellTypes: ['zsh'],
      };

      const result = await generator.generate(toolConfigs, options);

      expect(result).not.toBeNull();
      const generatedContent = await mockFileSystem.readFile(result!.files.get('zsh')!);
      expect(generatedContent).toContain('# Base init');
      // Empty platform arrays shouldn't cause issues
    });

    it('should handle tools with only platform-specific configs and no base shell init', async () => {
      const windowsSystemInfo: ISystemInfo = {
        platform: 'win32',
        arch: 'x64',
        homeDir: 'C:\\Users\\test',
      };

      const toolConfigs: Record<string, ToolConfig> = {
        'windows-only-tool': {
          name: 'windows-only-tool',
          version: 'latest',
          installationMethod: 'manual',
          // No base zshInit
          platformConfigs: [
            {
              platforms: Platform.Windows,
              config: {
                shellConfigs: { zsh: { scripts: [always`# Windows-only init`] } },
                binaries: ['win-tool.exe'],
              },
            },
          ],
        },
      };

      const options: IGenerateShellInitOptions = {
        systemInfo: windowsSystemInfo,
        shellTypes: ['zsh'],
      };

      const result = await generator.generate(toolConfigs, options);

      expect(result).not.toBeNull();
      const generatedContent = await mockFileSystem.readFile(result!.files.get('zsh')!);
      expect(generatedContent).toContain('# Windows-only init');
    });
  });
});
