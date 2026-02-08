import type { ProjectConfig } from '@dotfiles/config';
import type { ISystemInfo, ToolConfig } from '@dotfiles/core';
import { always, Architecture, Platform } from '@dotfiles/core';
import { createMemFileSystem, type IFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createMockProjectConfig, createTestDirectories, type ITestDirectories } from '@dotfiles/testing-helpers';
import { beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import type { IGenerateShellInitOptions } from '../IShellInitGenerator';
import { ShellInitGenerator } from '../ShellInitGenerator';

describe('ShellInitGenerator - Platform-Aware Generation', () => {
  let mockFileSystem: IFileSystem;
  let mockProjectConfig: ProjectConfig;
  let generator: ShellInitGenerator;
  let logger: TestLogger;
  let testDirs: ITestDirectories;

  beforeEach(async () => {
    const { fs } = await createMemFileSystem({});
    mockFileSystem = fs;
    logger = new TestLogger();

    testDirs = await createTestDirectories(logger, mockFileSystem, { testName: 'shell-init-platform-aware' });

    mockProjectConfig = await createMockProjectConfig({
      config: {
        paths: testDirs.paths,
      },
      filePath: path.join(testDirs.paths.dotfilesDir, 'config.ts'),
      fileSystem: mockFileSystem,
      logger,
      systemInfo: {
        platform: Platform.MacOS,
        arch: Architecture.Arm64,
        homeDir: testDirs.paths.homeDir,
        hostname: 'test-host',
      },
      env: {},
    });

    generator = new ShellInitGenerator(logger, mockFileSystem, mockProjectConfig);
  });

  describe('with platform-specific tool configurations', () => {
    it('should generate shell code including macOS platform-specific content', async () => {
      const macosSystemInfo: ISystemInfo = {
        platform: Platform.MacOS,
        arch: Architecture.Arm64,
        homeDir: '/Users/test',
        hostname: 'test-host',
      };

      const toolConfigs: Record<string, ToolConfig> = {
        aerospace: {
          name: 'aerospace',
          version: 'latest',
          installationMethod: 'manual',
          shellConfigs: { zsh: { scripts: [always(`# Base aerospace init`)] } },
          platformConfigs: [
            {
              platforms: Platform.MacOS,
              config: {
                binaries: ['aerospace'],
                shellConfigs: {
                  zsh: {
                    scripts: [
                      always(`# macOS aerospace init`),
                      always(`export AEROSPACE_CONFIG="~/.config/aerospace/aerospace.toml"`),
                    ],
                  },
                },
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
      expect(result!.files.has('zsh')).toBe(true);

      const generatedFilePath = result!.files.get('zsh')!;
      const generatedContent = await mockFileSystem.readFile(generatedFilePath);

      // Should include both base and platform-specific zsh init
      expect(generatedContent).toContain('# Base aerospace init');
      expect(generatedContent).toContain('# macOS aerospace init');
      expect(generatedContent).toContain('export AEROSPACE_CONFIG="~/.config/aerospace/aerospace.toml"');
    });

    it('should generate shell code excluding non-matching platform content', async () => {
      const linuxSystemInfo: ISystemInfo = {
        platform: Platform.Linux,
        arch: Architecture.X86_64,
        homeDir: '/home/test',
        hostname: 'test-host',
      };

      const toolConfigs: Record<string, ToolConfig> = {
        aerospace: {
          name: 'aerospace',
          version: 'latest',
          installationMethod: 'manual',
          shellConfigs: { zsh: { scripts: [always(`# Base aerospace init`)] } },
          platformConfigs: [
            {
              platforms: Platform.MacOS, // Only for macOS
              config: {
                shellConfigs: { zsh: { scripts: [always(`# macOS-only aerospace init`)] } },
                binaries: ['aerospace'],
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
      const generatedFilePath = result!.files.get('zsh')!;
      const generatedContent = await mockFileSystem.readFile(generatedFilePath);

      // Should only include base init, not platform-specific
      expect(generatedContent).toContain('# Base aerospace init');
      expect(generatedContent).not.toContain('# macOS-only aerospace init');
    });

    it('should handle multiple platform-specific configurations', async () => {
      const macosSystemInfo: ISystemInfo = {
        platform: Platform.MacOS,
        arch: Architecture.Arm64,
        homeDir: '/Users/test',
        hostname: 'test-host',
      };

      const toolConfigs: Record<string, ToolConfig> = {
        'multi-platform-tool': {
          name: 'multi-platform-tool',
          version: 'latest',
          installationMethod: 'manual',
          shellConfigs: { zsh: { scripts: [always(`# Base init`)] } },
          platformConfigs: [
            {
              platforms: Platform.Unix, // Matches both Linux and macOS
              config: {
                shellConfigs: { zsh: { scripts: [always(`# Unix common init`)] } },
              },
            },
            {
              platforms: Platform.MacOS,
              config: {
                shellConfigs: { zsh: { scripts: [always(`# macOS specific init`)] } },
                binaries: ['macos-tool'],
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
      const generatedFilePath = result!.files.get('zsh')!;
      const generatedContent = await mockFileSystem.readFile(generatedFilePath);

      // Should include all matching platform configs in order
      expect(generatedContent).toContain('# Base init');
      expect(generatedContent).toContain('# Unix common init');
      expect(generatedContent).toContain('# macOS specific init');

      // Check order by finding indices
      const baseIndex = generatedContent.indexOf('# Base init');
      const unixIndex = generatedContent.indexOf('# Unix common init');
      const macosIndex = generatedContent.indexOf('# macOS specific init');

      expect(baseIndex).toBeLessThan(unixIndex);
      expect(unixIndex).toBeLessThan(macosIndex);
    });

    it('should handle architecture-specific configurations', async () => {
      const macosArmSystemInfo: ISystemInfo = {
        platform: Platform.MacOS,
        arch: Architecture.Arm64,
        homeDir: '/Users/test',
        hostname: 'test-host',
      };

      const macosIntelSystemInfo: ISystemInfo = {
        platform: Platform.MacOS,
        arch: Architecture.X86_64,
        homeDir: '/Users/test',
        hostname: 'test-host',
      };

      const toolConfigs: Record<string, ToolConfig> = {
        'arch-specific-tool': {
          name: 'arch-specific-tool',
          version: 'latest',
          installationMethod: 'manual',
          shellConfigs: { zsh: { scripts: [always(`# Base init`)] } },
          platformConfigs: [
            {
              platforms: Platform.MacOS,
              architectures: Architecture.Arm64,
              config: {
                shellConfigs: { zsh: { scripts: [always(`# macOS ARM64 init`)] } },
                binaries: ['arm64-tool'],
              },
            },
            {
              platforms: Platform.MacOS,
              architectures: Architecture.X86_64,
              config: {
                shellConfigs: { zsh: { scripts: [always(`# macOS x86_64 init`)] } },
                binaries: ['x64-tool'],
              },
            },
          ],
        },
      };

      // Test ARM64 system
      const armOptions: IGenerateShellInitOptions = {
        systemInfo: macosArmSystemInfo,
        shellTypes: ['zsh'],
      };

      const armResult = await generator.generate(toolConfigs, armOptions);
      expect(armResult).not.toBeNull();
      const armContent = await mockFileSystem.readFile(armResult!.files.get('zsh')!);

      expect(armContent).toContain('# Base init');
      expect(armContent).toContain('# macOS ARM64 init');
      expect(armContent).not.toContain('# macOS x86_64 init');

      // Test x86_64 system
      const intelOptions: IGenerateShellInitOptions = {
        systemInfo: macosIntelSystemInfo,
        shellTypes: ['zsh'],
      };

      const intelResult = await generator.generate(toolConfigs, intelOptions);
      expect(intelResult).not.toBeNull();
      const intelContent = await mockFileSystem.readFile(intelResult!.files.get('zsh')!);

      expect(intelContent).toContain('# Base init');
      expect(intelContent).toContain('# macOS x86_64 init');
      expect(intelContent).not.toContain('# macOS ARM64 init');
    });

    it('should work without systemInfo provided (backward compatibility)', async () => {
      const toolConfigs: Record<string, ToolConfig> = {
        'platform-tool': {
          name: 'platform-tool',
          version: 'latest',
          installationMethod: 'github-release',
          installParams: { repo: 'test/repo' },
          binaries: ['platform-tool'],
          shellConfigs: { zsh: { scripts: [always(`# Base init only`)] } },
          platformConfigs: [
            {
              platforms: Platform.MacOS,
              config: {
                shellConfigs: { zsh: { scripts: [always(`# This should not appear`)] } },
              },
            },
          ],
        },
      };

      // No systemInfo provided - should not resolve platform configs
      const options: IGenerateShellInitOptions = {
        shellTypes: ['zsh'],
      };

      const result = await generator.generate(toolConfigs, options);

      expect(result).not.toBeNull();
      const generatedFilePath = result!.files.get('zsh')!;
      const generatedContent = await mockFileSystem.readFile(generatedFilePath);

      // Should only include base init, no platform-specific content
      expect(generatedContent).toContain('# Base init only');
      expect(generatedContent).not.toContain('# This should not appear');
    });

    it('should process platform-specific completions', async () => {
      const macosSystemInfo: ISystemInfo = {
        platform: Platform.MacOS,
        arch: Architecture.Arm64,
        homeDir: '/Users/test',
        hostname: 'test-host',
      };

      const toolConfigs: Record<string, ToolConfig> = {
        'tool-with-completions': {
          name: 'tool-with-completions',
          version: 'latest',
          installationMethod: 'manual',
          platformConfigs: [
            {
              platforms: Platform.MacOS,
              config: {
                binaries: ['completion-tool'],
                shellConfigs: {
                  zsh: {
                    completions: {
                      source: 'completions/_completion-tool',
                    },
                  },
                },
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
      const generatedFilePath = result!.files.get('zsh')!;
      const generatedContent = await mockFileSystem.readFile(generatedFilePath);

      // Should include completion setup from platform config
      expect(generatedContent).toContain('Shell Completions Setup');
      expect(generatedContent).toContain('fpath=('); // zsh completion setup
    });
  });

  describe('multiple tools with mixed platform configurations', () => {
    it('should handle mix of platform-specific and regular tools', async () => {
      const macosSystemInfo: ISystemInfo = {
        platform: Platform.MacOS,
        arch: Architecture.Arm64,
        homeDir: '/Users/test',
        hostname: 'test-host',
      };

      const toolConfigs: Record<string, ToolConfig> = {
        'regular-tool': {
          name: 'regular-tool',
          version: 'latest',
          installationMethod: 'github-release',
          installParams: { repo: 'test/regular' },
          binaries: ['regular'],
          shellConfigs: { zsh: { scripts: [always(`# Regular tool init`)] } },
        },
        'platform-tool': {
          name: 'platform-tool',
          version: 'latest',
          installationMethod: 'manual',
          shellConfigs: { zsh: { scripts: [always(`# Base platform init`)] } },
          platformConfigs: [
            {
              platforms: Platform.MacOS,
              config: {
                shellConfigs: { zsh: { scripts: [always(`# macOS platform init`)] } },
                binaries: ['macos-platform'],
              },
            },
          ],
        },
        'linux-only-tool': {
          name: 'linux-only-tool',
          version: 'latest',
          installationMethod: 'manual',
          platformConfigs: [
            {
              platforms: Platform.Linux,
              config: {
                shellConfigs: { zsh: { scripts: [always(`# Linux only - should not appear`)] } },
                binaries: ['linux-only'],
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
      const generatedFilePath = result!.files.get('zsh')!;
      const generatedContent = await mockFileSystem.readFile(generatedFilePath);

      // Should include regular tool
      expect(generatedContent).toContain('# Regular tool init');

      // Should include platform tool's base and macOS content
      expect(generatedContent).toContain('# Base platform init');
      expect(generatedContent).toContain('# macOS platform init');

      // Should NOT include Linux-only content
      expect(generatedContent).not.toContain('# Linux only - should not appear');
    });
  });
});
