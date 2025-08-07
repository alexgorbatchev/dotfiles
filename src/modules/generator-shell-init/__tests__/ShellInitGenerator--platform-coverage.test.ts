import { beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import type { IFileSystem } from '@modules/file-system';
import type { YamlConfig } from '@modules/config';
import type { ToolConfig, SystemInfo } from '@types';
import { Platform, Architecture } from '@types';
import { ShellInitGenerator } from '../ShellInitGenerator';
import type { GenerateShellInitOptions } from '../IShellInitGenerator';
import { createMemFileSystem, TestLogger, createMockYamlConfig, createTestDirectories, type TestDirectories } from '@testing-helpers';

describe('ShellInitGenerator - Platform Coverage Tests', () => {
  let mockFileSystem: IFileSystem;
  let mockAppConfig: YamlConfig;
  let generator: ShellInitGenerator;
  let logger: TestLogger;
  let testDirs: TestDirectories;

  beforeEach(async () => {
    const { fs } = await createMemFileSystem({});
    mockFileSystem = fs;
    logger = new TestLogger();
    
    testDirs = await createTestDirectories(logger, mockFileSystem, { testName: 'shell-init-platform-coverage' });
    
    mockAppConfig = await createMockYamlConfig({
      config: {
        paths: testDirs.paths,
      },
      filePath: path.join(testDirs.paths.dotfilesDir, 'config.yaml'),
      fileSystem: mockFileSystem,
      logger,
      systemInfo: { platform: 'darwin', arch: 'arm64', homeDir: testDirs.paths.homeDir },
      env: {},
    });

    generator = new ShellInitGenerator(logger, mockFileSystem, mockAppConfig);
  });

  describe('multiple shell types with platform-specific code', () => {
    it('should generate platform-specific code for all shell types', async () => {
      const macosSystemInfo: SystemInfo = {
        platform: 'darwin',
        arch: 'arm64',
        homeDir: '/Users/test',
      };

      const toolConfigs: Record<string, ToolConfig> = {
        'multi-shell-tool': {
          name: 'multi-shell-tool',
          version: 'latest',
          installationMethod: 'none',
          zshInit: ['# Base zsh'],
          bashInit: ['# Base bash'],
          powershellInit: ['# Base powershell'],
          platformConfigs: [{
            platforms: Platform.MacOS,
            config: {
              zshInit: ['# macOS zsh specific'],
              bashInit: ['# macOS bash specific'],
              powershellInit: ['# macOS powershell specific'],
              binaries: ['macos-tool'],
            },
          }],
        },
      };

      const options: GenerateShellInitOptions = {
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
      const macosSystemInfo: SystemInfo = {
        platform: 'darwin',
        arch: 'arm64',
        homeDir: '/Users/test',
      };

      const toolConfigs: Record<string, ToolConfig> = {
        'symlink-tool': {
          name: 'symlink-tool',
          version: 'latest',
          installationMethod: 'none',
          zshInit: ['# Base init'],
          symlinks: [{ source: './base.conf', target: '~/.base.conf' }],
          platformConfigs: [{
            platforms: Platform.MacOS,
            config: {
              zshInit: ['# macOS init'],
              symlinks: [{ source: './macos.conf', target: '~/.macos.conf' }],
            },
          }],
        },
      };

      const options: GenerateShellInitOptions = {
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
      const linuxSystemInfo: SystemInfo = {
        platform: 'linux',
        arch: 'x64',
        homeDir: '/home/test',
      };

      const toolConfigs: Record<string, ToolConfig> = {
        'env-path-tool': {
          name: 'env-path-tool',
          version: 'latest',
          installationMethod: 'none',
          zshInit: [
            'export BASE_VAR="base_value"',
            'export PATH="/base/bin:$PATH"',
            '# Some other init code',
          ],
          platformConfigs: [{
            platforms: Platform.Linux,
            config: {
              zshInit: [
                'export LINUX_SPECIFIC="linux_value"',
                'export PATH="/linux/bin:$PATH"',
                'alias linux-cmd="some-command"',
                'fpath+="/linux/completions"',
              ],
            },
          }],
        },
      };

      const options: GenerateShellInitOptions = {
        systemInfo: linuxSystemInfo,
        shellTypes: ['zsh'],
      };

      const result = await generator.generate(toolConfigs, options);

      expect(result).not.toBeNull();
      const generatedContent = await mockFileSystem.readFile(result!.files.get('zsh')!);

      // Should have environment variables section with both base and platform-specific
      expect(generatedContent).toContain('Environment Variables');
      expect(generatedContent).toContain('export BASE_VAR="base_value"');
      expect(generatedContent).toContain('export LINUX_SPECIFIC="linux_value"');

      // Should have PATH modifications section with both base and platform-specific  
      expect(generatedContent).toContain('PATH Modifications');
      expect(generatedContent).toContain('export PATH="/base/bin:$PATH"');
      expect(generatedContent).toContain('export PATH="/linux/bin:$PATH"');
      expect(generatedContent).toContain('fpath+="/linux/completions"');

      // Should have tool-specific section with remaining code
      expect(generatedContent).toContain('Tool-Specific Initializations');
      expect(generatedContent).toContain('# Some other init code');
      expect(generatedContent).toContain('alias linux-cmd="some-command"');
    });
  });

  describe('real-world tool configurations', () => {
    it('should work with aerospace-like macOS-only tool', async () => {
      const macosSystemInfo: SystemInfo = {
        platform: 'darwin',
        arch: 'arm64',
        homeDir: '/Users/test',
      };

      const linuxSystemInfo: SystemInfo = {
        platform: 'linux',
        arch: 'x64',
        homeDir: '/home/test',
      };

      // Mimic the actual aerospace.tool.ts structure
      const toolConfigs: Record<string, ToolConfig> = {
        'aerospace': {
          name: 'aerospace',
          version: 'latest',
          installationMethod: 'none', // Base has no install method
          platformConfigs: [{
            platforms: Platform.MacOS,
            config: {
              binaries: ['aerospace'],
              installationMethod: 'brew',
              installParams: {
                formula: 'nikitabobko/tap/aerospace',
                cask: true,
              },
              symlinks: [{ source: './aerospace.toml', target: '~/.config/aerospace/aerospace.toml' }],
              // Aerospace might have shell init for keybindings or env vars
              zshInit: ['# Aerospace window manager integration'],
            },
          }],
        },
      };

      // Test on macOS - should include aerospace
      const macosOptions: GenerateShellInitOptions = {
        systemInfo: macosSystemInfo,
        shellTypes: ['zsh'],
      };

      const macosResult = await generator.generate(toolConfigs, macosOptions);
      expect(macosResult).not.toBeNull();
      const macosContent = await mockFileSystem.readFile(macosResult!.files.get('zsh')!);
      expect(macosContent).toContain('# Aerospace window manager integration');

      // Test on Linux - should not include aerospace  
      const linuxOptions: GenerateShellInitOptions = {
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
      const macosSystemInfo: SystemInfo = {
        platform: 'darwin',
        arch: 'arm64',
        homeDir: '/Users/test',
      };

      const linuxSystemInfo: SystemInfo = {
        platform: 'linux',
        arch: 'x64',
        homeDir: '/home/test',
      };

      // Mimic the actual eza.tool.ts structure
      const toolConfigs: Record<string, ToolConfig> = {
        'eza': {
          name: 'eza',
          version: 'latest',
          installationMethod: 'none',
          zshInit: [
            '# Base eza aliases',
            'alias ls="eza --group-directories-first --git"',
            'alias ll="eza -la --group-directories-first --git"',
          ],
          platformConfigs: [
            {
              platforms: Platform.MacOS,
              config: {
                binaries: ['eza'],
                // macOS has custom installation via script/hooks
                zshInit: ['# macOS specific eza setup'],
              },
            },
            {
              platforms: Platform.Linux,
              config: {
                binaries: ['eza'],
                installationMethod: 'github-release',
                installParams: { repo: 'eza-community/eza' },
                zshInit: ['# Linux specific eza setup'],
              },
            },
          ],
        },
      };

      // Test macOS version
      const macosOptions: GenerateShellInitOptions = {
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
      const linuxOptions: GenerateShellInitOptions = {
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
      const macosSystemInfo: SystemInfo = {
        platform: 'darwin',
        arch: 'arm64', 
        homeDir: '/Users/test',
      };

      const toolConfigs: Record<string, ToolConfig> = {
        'empty-platform-tool': {
          name: 'empty-platform-tool',
          version: 'latest',
          installationMethod: 'none',
          zshInit: ['# Base init'],
          platformConfigs: [{
            platforms: Platform.MacOS,
            config: {
              zshInit: [], // Empty array
              binaries: ['empty-tool'],
            },
          }],
        },
      };

      const options: GenerateShellInitOptions = {
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
      const windowsSystemInfo: SystemInfo = {
        platform: 'win32',
        arch: 'x64',
        homeDir: 'C:\\Users\\test',
      };

      const toolConfigs: Record<string, ToolConfig> = {
        'windows-only-tool': {
          name: 'windows-only-tool',
          version: 'latest',
          installationMethod: 'none',
          // No base zshInit
          platformConfigs: [{
            platforms: Platform.Windows,
            config: {
              zshInit: ['# Windows-only init'],
              binaries: ['win-tool.exe'],
            },
          }],
        },
      };

      const options: GenerateShellInitOptions = {
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