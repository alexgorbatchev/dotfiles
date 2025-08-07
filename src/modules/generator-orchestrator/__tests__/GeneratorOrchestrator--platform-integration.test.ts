import { beforeEach, describe, expect, it } from 'bun:test';
import path from 'node:path';
import type { IFileSystem } from '@modules/file-system';
import type { YamlConfig } from '@modules/config';
import type { ToolConfig, SystemInfo, GeneratedArtifactsManifest } from '@types';
import { Platform } from '@types';
import { GeneratorOrchestrator } from '../GeneratorOrchestrator';
import type { IShimGenerator } from '@modules/generator-shim';
import type { IShellInitGenerator, ShellInitGenerationResult } from '@modules/generator-shell-init';
import type { ISymlinkGenerator, SymlinkOperationResult } from '@modules/generator-symlink';
import { createMemFileSystem, TestLogger, createMockYamlConfig, createTestDirectories, type TestDirectories } from '@testing-helpers';

describe('GeneratorOrchestrator - Platform Integration Tests', () => {
  let mockFileSystem: IFileSystem;
  let mockAppConfig: YamlConfig;
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
        // Mock shell generator that checks if systemInfo was passed
        const shellFilePath = path.join(testDirs.paths.shellScriptsDir, 'main.zsh');
        const mockResult: ShellInitGenerationResult = {
          files: new Map([['zsh', shellFilePath]]),
          primaryPath: shellFilePath,
        };

        // Write mock content that includes platform info for verification
        let mockContent = '# Generated shell init\n';
        if (options?.systemInfo) {
          mockContent += `# Platform: ${options.systemInfo.platform}\n`;
          mockContent += `# Arch: ${options.systemInfo.arch}\n`;

          // Check if any tools have platform configs for this system
          for (const [toolName, config] of Object.entries(toolConfigs)) {
            if (config.platformConfigs) {
              for (const platformConfig of config.platformConfigs) {
                const isMatch = 
                  (platformConfig.platforms & Platform.MacOS && options.systemInfo.platform === 'darwin') ||
                  (platformConfig.platforms & Platform.Linux && options.systemInfo.platform === 'linux');
                
                if (isMatch && platformConfig.config.zshInit) {
                  mockContent += `# Platform-specific content for ${toolName}: ${platformConfig.config.zshInit.join(' ')}\n`;
                }
              }
            }
          }
        }

        await mockFileSystem.ensureDir(testDirs.paths.shellScriptsDir);
        await mockFileSystem.writeFile(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'), mockContent);
        return mockResult;
      },
    };

    mockSymlinkGenerator = {
      generate: async () => {
        const mockResult: SymlinkOperationResult = {
          created: [{ source: '/test/src', target: '/test/target', toolName: 'test' }],
          skipped: [],
          failed: [],
        };
        return mockResult;
      },
      generateForTool: async () => Promise.resolve({
        created: [],
        skipped: [],
        failed: [],
      }),
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
        mockAppConfig,
        macosSystemInfo // macOS system info
      );

      const toolConfigs: Record<string, ToolConfig> = {
        'aerospace': {
          name: 'aerospace',
          version: 'latest',
          installationMethod: 'none',
          platformConfigs: [{
            platforms: Platform.MacOS,
            config: {
              binaries: ['aerospace'],
              zshInit: ['# macOS aerospace init'],
            },
          }],
        },
        'regular-tool': {
          name: 'regular-tool', 
          version: 'latest',
          installationMethod: 'github-release',
          installParams: { repo: 'test/regular' },
          binaries: ['regular'],
          zshInit: ['# Regular tool init'],
        },
      };

      const result: GeneratedArtifactsManifest = await orchestrator.generateAll(toolConfigs);

      expect(result).toBeDefined();
      expect(result.shellInit?.path).toBeDefined();

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
        mockAppConfig,
        linuxSystemInfo // Linux system info
      );

      const toolConfigs: Record<string, ToolConfig> = {
        'cross-platform-tool': {
          name: 'cross-platform-tool',
          version: 'latest',
          installationMethod: 'none',
          zshInit: ['# Base init'],
          platformConfigs: [
            {
              platforms: Platform.MacOS,
              config: {
                zshInit: ['# macOS specific - should not appear'],
              },
            },
            {
              platforms: Platform.Linux,
              config: {
                zshInit: ['# Linux specific - should appear'],
              },
            },
          ],
        },
      };

      const result: GeneratedArtifactsManifest = await orchestrator.generateAll(toolConfigs);

      expect(result).toBeDefined();
      expect(result.shellInit?.path).toBeDefined();

      // Verify the shell generator received Linux systemInfo
      const shellContent = await mockFileSystem.readFile(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));
      expect(shellContent).toContain('# Platform: linux');
      expect(shellContent).toContain('# Arch: x64');
      expect(shellContent).toContain('# Platform-specific content for cross-platform-tool: # Linux specific - should appear');
      expect(shellContent).not.toContain('# macOS specific - should not appear');
    });

    it('should handle tools with no platform configs', async () => {
      orchestrator = new GeneratorOrchestrator(
        logger,
        mockShimGenerator,
        mockShellInitGenerator,
        mockSymlinkGenerator,
        mockFileSystem,
        mockAppConfig,
        macosSystemInfo
      );

      const toolConfigs: Record<string, ToolConfig> = {
        'simple-tool': {
          name: 'simple-tool',
          version: 'latest',
          installationMethod: 'github-release',
          installParams: { repo: 'test/simple' },
          binaries: ['simple'],
          zshInit: ['# Simple tool init'],
          // No platform configs
        },
      };

      const result: GeneratedArtifactsManifest = await orchestrator.generateAll(toolConfigs);

      expect(result).toBeDefined();
      expect(result.shellInit?.path).toBeDefined();

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
        mockAppConfig,
        macosSystemInfo
      );

      const toolConfigs: Record<string, ToolConfig> = {
        'full-platform-tool': {
          name: 'full-platform-tool',
          version: 'latest',
          installationMethod: 'none',
          zshInit: ['# Base shell init'],
          symlinks: [{ source: './base.conf', target: '~/.base.conf' }],
          platformConfigs: [{
            platforms: Platform.MacOS,
            config: {
              binaries: ['macos-binary'],
              zshInit: ['# macOS shell init'],
              symlinks: [{ source: './macos.conf', target: '~/.macos.conf' }],
              installationMethod: 'brew',
              installParams: { formula: 'test-formula' },
            },
          }],
        },
      };

      const result: GeneratedArtifactsManifest = await orchestrator.generateAll(toolConfigs);

      // Verify all generators were called and manifest was populated
      expect(result).toBeDefined();
      expect(result.shims).toEqual(['/test/bin/shim1', '/test/bin/shim2']);
      expect(result.shellInit?.path).toBe(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));
      expect(result.symlinks?.created).toHaveLength(1);

      // Verify shell content includes platform-aware information
      const shellContent = await mockFileSystem.readFile(path.join(testDirs.paths.shellScriptsDir, 'main.zsh'));
      expect(shellContent).toContain('# Platform: darwin');
      expect(shellContent).toContain('# Platform-specific content for full-platform-tool: # macOS shell init');
    });
  });
});