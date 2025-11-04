import { beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import type { PlatformConfig, SystemInfo, ToolConfig } from '@dotfiles/core';
import { always, Platform } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import { createMemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import type { IShellInitGenerator, ShellInitGenerationResult } from '@dotfiles/shell-init-generator';
import type { IShimGenerator } from '@dotfiles/shim-generator';
import type { ISymlinkGenerator, SymlinkOperationResult } from '@dotfiles/symlink-generator';
import { createTestDirectories, type TestDirectories } from '@dotfiles/testing-helpers';
import { GeneratorOrchestrator } from '../GeneratorOrchestrator';

// Helper function to generate platform-specific content
function generatePlatformContent(toolConfigs: Record<string, ToolConfig>, systemInfo: SystemInfo): string {
  let content = '';

  for (const [toolName, config] of Object.entries(toolConfigs)) {
    if (config.platformConfigs) {
      for (const platformConfig of config.platformConfigs) {
        const isMatch =
          ((platformConfig.platforms & Platform.MacOS) !== 0 && systemInfo.platform === 'darwin') ||
          ((platformConfig.platforms & Platform.Linux) !== 0 && systemInfo.platform === 'linux');

        const config = platformConfig.config as PlatformConfig;
        if (isMatch && config.shellConfigs?.zsh?.scripts) {
          content += `# Platform-specific content for ${toolName}: ${config.shellConfigs.zsh.scripts.join(' ')}\n`;
        }
      }
    }
  }

  return content;
}

// Helper function to create mock shell content
function createMockShellContent(toolConfigs: Record<string, ToolConfig>, systemInfo?: SystemInfo): string {
  let mockContent = '# Generated shell init\n';

  if (systemInfo) {
    mockContent += `# Platform: ${systemInfo.platform}\n`;
    mockContent += `# Arch: ${systemInfo.arch}\n`;
    mockContent += generatePlatformContent(toolConfigs, systemInfo);
  }

  return mockContent;
}

describe('GeneratorOrchestrator - Platform Integration Tests', () => {
  let mockFileSystem: IFileSystem;
  let orchestrator: GeneratorOrchestrator;
  let logger: TestLogger;
  let mockShimGenerator: IShimGenerator;
  let mockShellInitGenerator: IShellInitGenerator;
  let mockSymlinkGenerator: ISymlinkGenerator;
  let macosSystemInfo: SystemInfo;
  let linuxSystemInfo: SystemInfo;
  let testDirs: TestDirectories;

  beforeEach(async () => {
    const { fs } = await createMemFileSystem({});
    mockFileSystem = fs;
    logger = new TestLogger();

    testDirs = await createTestDirectories(logger, mockFileSystem, { testName: 'orchestrator-platform-integration' });

    macosSystemInfo = {
      platform: 'darwin',
      arch: 'arm64',
      homeDir: testDirs.paths.homeDir,
    };

    linuxSystemInfo = {
      platform: 'linux',
      arch: 'x64',
      homeDir: testDirs.paths.homeDir,
    };

    // Create mock generators
    mockShimGenerator = {
      generate: async () => Promise.resolve(['/test/bin/shim1', '/test/bin/shim2']),
      generateForTool: async () => Promise.resolve([]),
    };

    mockShellInitGenerator = {
      generate: async (toolConfigs, options) => {
        const shellFilePath = path.join(testDirs.paths.shellScriptsDir, 'main.zsh');
        const mockResult: ShellInitGenerationResult = {
          files: new Map([['zsh', shellFilePath]]),
          primaryPath: shellFilePath,
        };

        const mockContent = createMockShellContent(toolConfigs, options?.systemInfo);

        await mockFileSystem.ensureDir(testDirs.paths.shellScriptsDir);
        await mockFileSystem.writeFile(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'), mockContent);
        return mockResult;
      },
    };

    mockSymlinkGenerator = {
      generate: async () => {
        const mockResult: SymlinkOperationResult = {
          sourcePath: '/test/src',
          targetPath: '/test/target',
          status: 'created',
        };
        return [mockResult];
      },
    };
  });

  describe('systemInfo integration', () => {
    it('should pass systemInfo to shell generator for macOS platform-specific tools', async () => {
      orchestrator = new GeneratorOrchestrator(
        logger,
        mockShimGenerator,
        mockShellInitGenerator,
        mockSymlinkGenerator,
        mockFileSystem,
        macosSystemInfo // macOS system info
      );

      const toolConfigs: Record<string, ToolConfig> = {
        aerospace: {
          name: 'aerospace',
          version: 'latest',
          installationMethod: 'manual',
          platformConfigs: [
            {
              platforms: Platform.MacOS,
              config: {
                binaries: ['aerospace'],
                shellConfigs: {
                  zsh: {
                    scripts: [always`# macOS aerospace init`],
                  },
                },
              },
            },
          ],
        },
        'regular-tool': {
          name: 'regular-tool',
          version: 'latest',
          installationMethod: 'github-release',
          installParams: { repo: 'test/regular' },
          binaries: ['regular'],
          shellConfigs: {
            zsh: {
              scripts: [always`# Regular tool init`],
            },
          },
        },
      };

      await orchestrator.generateAll(toolConfigs);

      // Verify the shell generator received systemInfo and processed platform configs
      const shellContent = await mockFileSystem.readFile(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));
      expect(shellContent).toContain('# Platform: darwin');
      expect(shellContent).toContain('# Arch: arm64');
      expect(shellContent).toContain('# Platform-specific content for aerospace: # macOS aerospace init');
    });

    it('should pass systemInfo to shell generator for Linux', async () => {
      orchestrator = new GeneratorOrchestrator(
        logger,
        mockShimGenerator,
        mockShellInitGenerator,
        mockSymlinkGenerator,
        mockFileSystem,
        linuxSystemInfo // Linux system info
      );

      const toolConfigs: Record<string, ToolConfig> = {
        'cross-platform-tool': {
          name: 'cross-platform-tool',
          version: 'latest',
          installationMethod: 'manual',
          shellConfigs: {
            zsh: {
              scripts: [always`# Base init`],
            },
          },
          platformConfigs: [
            {
              platforms: Platform.MacOS,
              config: {
                shellConfigs: {
                  zsh: {
                    scripts: [always`# macOS specific - should not appear`],
                  },
                },
              },
            },
            {
              platforms: Platform.Linux,
              config: {
                shellConfigs: {
                  zsh: {
                    scripts: [always`# Linux specific - should appear`],
                  },
                },
              },
            },
          ],
        },
      };

      await orchestrator.generateAll(toolConfigs);

      // Verify the shell generator received Linux systemInfo
      const shellContent = await mockFileSystem.readFile(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));
      expect(shellContent).toContain('# Platform: linux');
      expect(shellContent).toContain('# Arch: x64');
      expect(shellContent).toContain(
        '# Platform-specific content for cross-platform-tool: # Linux specific - should appear'
      );
      expect(shellContent).not.toContain('# macOS specific - should not appear');
    });

    it('should handle tools with no platform configs', async () => {
      orchestrator = new GeneratorOrchestrator(
        logger,
        mockShimGenerator,
        mockShellInitGenerator,
        mockSymlinkGenerator,
        mockFileSystem,
        macosSystemInfo
      );

      const toolConfigs: Record<string, ToolConfig> = {
        'simple-tool': {
          name: 'simple-tool',
          version: 'latest',
          installationMethod: 'github-release',
          installParams: { repo: 'test/simple' },
          binaries: ['simple'],
          shellConfigs: {
            zsh: {
              scripts: [always`# Simple tool init`],
            },
          },
          // No platform configs
        },
      };

      await orchestrator.generateAll(toolConfigs);

      // Should still work even with no platform configs
      const shellContent = await mockFileSystem.readFile(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));
      expect(shellContent).toContain('# Platform: darwin');
      expect(shellContent).toContain('# Arch: arm64');
      // No platform-specific content expected since there are no platform configs
    });
  });

  describe('full integration with multiple generators', () => {
    it('should coordinate all generators with platform-aware systemInfo', async () => {
      orchestrator = new GeneratorOrchestrator(
        logger,
        mockShimGenerator,
        mockShellInitGenerator,
        mockSymlinkGenerator,
        mockFileSystem,
        macosSystemInfo
      );

      const toolConfigs: Record<string, ToolConfig> = {
        'full-platform-tool': {
          name: 'full-platform-tool',
          version: 'latest',
          installationMethod: 'manual',
          shellConfigs: {
            zsh: {
              scripts: [always`# Base shell init`],
            },
          },
          symlinks: [{ source: './base.conf', target: '~/.base.conf' }],
          platformConfigs: [
            {
              platforms: Platform.MacOS,
              config: {
                binaries: ['macos-binary'],
                shellConfigs: {
                  zsh: {
                    scripts: [always`# macOS shell init`],
                  },
                },
                symlinks: [{ source: './macos.conf', target: '~/.macos.conf' }],
              },
            },
          ],
        },
      };

      await orchestrator.generateAll(toolConfigs);

      // Verify shell content includes platform-aware information
      const shellContent = await mockFileSystem.readFile(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));
      expect(shellContent).toContain('# Platform: darwin');
      expect(shellContent).toContain('# Platform-specific content for full-platform-tool: # macOS shell init');
    });
  });
});
