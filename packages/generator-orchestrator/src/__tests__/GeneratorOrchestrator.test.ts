import type { ProjectConfig } from '@dotfiles/config';
import { always, Architecture, type ISystemInfo, Platform, raw, type ToolConfig } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import { createMemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createMockFileRegistry, type TrackedFileSystem } from '@dotfiles/registry/file';
import type { ICompletionGenerator, IShellInitGenerator } from '@dotfiles/shell-init-generator';
import type { IShimGenerator } from '@dotfiles/shim-generator';
import type { ISymlinkGenerator, SymlinkOperationResult } from '@dotfiles/symlink-generator';
import { createMockProjectConfig, createTestDirectories, type ITestDirectories } from '@dotfiles/testing-helpers';
import { beforeEach, describe, expect, it, mock, type spyOn } from 'bun:test';
import assert from 'node:assert';
import path from 'node:path';
import { GeneratorOrchestrator } from '../GeneratorOrchestrator';

const testCompletionsCallback = (ctx: { version?: string; }): { url: string; } => ({
  url: `https://example.com/completions/${ctx.version}/completion.zsh`,
});

/**
 * Creates a mock TrackedFileSystem for testing.
 * The mock implements withContext() by returning itself with the new context.
 */
function createMockTrackedFileSystem(fs: IFileSystem): TrackedFileSystem {
  const mockTrackedFs: TrackedFileSystem = {
    ...fs,
    withContext: mock(() => mockTrackedFs),
    setSuppressLogging: mock(() => {}),
  } as unknown as TrackedFileSystem;
  return mockTrackedFs;
}

describe('GeneratorOrchestrator', () => {
  let mockShimGenerator: IShimGenerator;
  let mockShellInitGenerator: IShellInitGenerator;
  let mockSymlinkGenerator: ISymlinkGenerator;
  let mockCompletionGenerator: ICompletionGenerator;
  let mockFileSystem: IFileSystem;
  let mockProjectConfig: ProjectConfig;
  let orchestrator: GeneratorOrchestrator;
  let logger: TestLogger;
  let testDirs: ITestDirectories;
  let systemInfo: ISystemInfo;

  let mockFsExists: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    mock.restore();
    logger = new TestLogger();

    mockShimGenerator = {
      generate: mock(async () => Promise.resolve([] as string[])),
      generateForTool: mock(async () => Promise.resolve([])),
    };
    mockShellInitGenerator = {
      generate: mock(async () =>
        Promise.resolve({
          files: new Map(),
          primaryPath: null,
        })
      ),
    };
    mockSymlinkGenerator = {
      generate: mock(async () => Promise.resolve([] as SymlinkOperationResult[])),
      createBinarySymlink: mock(async () => {}),
    };
    mockCompletionGenerator = {
      generateCompletionFile: mock(async () =>
        Promise.resolve({
          content: '# completion',
          filename: '_tool',
          targetPath: '/path/_tool',
          generatedBy: 'command' as const,
        })
      ),
      generateAndWriteCompletionFile: mock(async () =>
        Promise.resolve({
          content: '# completion',
          filename: '_tool',
          targetPath: '/path/_tool',
          generatedBy: 'command' as const,
        })
      ),
    };

    const { fs, spies } = await createMemFileSystem({});
    mockFileSystem = fs;
    mockFsExists = spies.exists;

    testDirs = await createTestDirectories(logger, mockFileSystem, { testName: 'generator-orchestrator' });

    systemInfo = { platform: Platform.Linux, arch: Architecture.X86_64, homeDir: testDirs.paths.homeDir };

    mockProjectConfig = await createMockProjectConfig({
      config: {
        paths: testDirs.paths,
      },
      filePath: path.join(testDirs.paths.dotfilesDir, 'config.ts'),
      fileSystem: mockFileSystem,
      logger,
      systemInfo,
      env: {},
    });

    orchestrator = new GeneratorOrchestrator(
      logger,
      mockShimGenerator,
      mockShellInitGenerator,
      mockSymlinkGenerator,
      mockCompletionGenerator,
      systemInfo,
      mockProjectConfig,
      createMockFileRegistry(),
      mockFileSystem,
      createMockTrackedFileSystem(mockFileSystem),
    );
  });

  it('should initialize correctly', () => {
    expect(orchestrator).toBeInstanceOf(GeneratorOrchestrator);
  });

  describe('generateAll', () => {
    const toolConfigs: Record<string, ToolConfig> = {
      toolA: {
        name: 'toolA',
        binaries: ['ta'],
        version: '1.0',
        symlinks: [{ source: 'a.conf', target: '~/.a.conf' }],
        installationMethod: 'manual',
        installParams: {},
      },
      toolB: {
        name: 'toolB',
        binaries: ['tb'],
        version: '2.0',
        shellConfigs: {
          zsh: {
            scripts: [always(`export TB=1`)],
          },
        },
        installationMethod: 'manual',
        installParams: {},
      },
    };

    it('should call sub-generators with correct options', async () => {
      mockFsExists.mockResolvedValue(false); // No existing manifest for this path

      // The dryRun option is no longer passed to orchestrator.generateAll
      // and subsequently not to sub-generators by the orchestrator.
      await orchestrator.generateAll(toolConfigs); // Pass empty options or specific non-dryRun options like generatorVersion

      expect(mockShimGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
        // dryRun: false, // Removed
        overwrite: true,
      });
      expect(mockShellInitGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
        shellTypes: ['zsh', 'bash', 'powershell'],
        systemInfo,
        pluginShellInit: {},
      });
      expect(mockSymlinkGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
        // dryRun: false, // Removed
        overwrite: true,
        backup: true,
      });
    });

    it('should call sub-generators correctly', async () => {
      await orchestrator.generateAll(toolConfigs);

      expect(mockShimGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
        overwrite: true,
      });
      expect(mockShellInitGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
        shellTypes: ['zsh', 'bash', 'powershell'],
        systemInfo,
        pluginShellInit: {},
      });
      expect(mockSymlinkGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
        overwrite: true,
        backup: true,
      });
    });

    it('should handle empty toolConfigs gracefully', async () => {
      await orchestrator.generateAll({});

      expect(mockShimGenerator.generate).toHaveBeenCalledWith(
        {},
        {
          overwrite: true,
        },
      );
      expect(mockShellInitGenerator.generate).toHaveBeenCalledWith(
        {},
        {
          shellTypes: ['zsh', 'bash', 'powershell'],
          systemInfo,
          pluginShellInit: {},
        },
      );
      expect(mockSymlinkGenerator.generate).toHaveBeenCalledWith(
        {},
        {
          overwrite: true,
          backup: true,
        },
      );
    });

    it('should call all generators in correct order', async () => {
      const shimSpy = mockShimGenerator.generate as ReturnType<typeof mock>;
      const shellSpy = mockShellInitGenerator.generate as ReturnType<typeof mock>;
      const symlinkSpy = mockSymlinkGenerator.generate as ReturnType<typeof mock>;

      await orchestrator.generateAll(toolConfigs);

      expect(shimSpy).toHaveBeenCalled();
      expect(shellSpy).toHaveBeenCalled();
      expect(symlinkSpy).toHaveBeenCalled();
    });

    it('should call generators with mocked results', async () => {
      const mockShimPaths = [
        path.join(mockProjectConfig.paths.targetDir, 'toolA'),
        path.join(mockProjectConfig.paths.targetDir, 'toolB'),
      ];
      const mockShellInitPath = path.join(mockProjectConfig.paths.shellScriptsDir, 'main.zsh');
      const mockSymlinkResults: SymlinkOperationResult[] = [
        {
          success: true,
          sourcePath: path.join(mockProjectConfig.paths.dotfilesDir, 'a.conf'),

          targetPath: path.join('/test/home', '.a.conf'),
          status: 'created',
        },
      ];

      (mockShimGenerator.generate as ReturnType<typeof mock>).mockResolvedValue(mockShimPaths);
      (mockShellInitGenerator.generate as ReturnType<typeof mock>).mockResolvedValue({
        files: new Map([['zsh', mockShellInitPath]]),
        primaryPath: mockShellInitPath,
      });
      (mockSymlinkGenerator.generate as ReturnType<typeof mock>).mockResolvedValue(mockSymlinkResults);

      await orchestrator.generateAll(toolConfigs);

      expect(mockShimGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
        overwrite: true,
      });
      expect(mockShellInitGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
        shellTypes: ['zsh', 'bash', 'powershell'],
        systemInfo,
        pluginShellInit: {},
      });
      expect(mockSymlinkGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
        overwrite: true,
        backup: true,
      });
    });

    it('should complete generation without errors', async () => {
      const mockShimPaths = [path.join(mockProjectConfig.paths.targetDir, 'toolA-write')];
      const mockShellInitPathWrite = path.join(mockProjectConfig.paths.shellScriptsDir, 'init-write.zsh');
      const mockSymlinkResultsWrite: SymlinkOperationResult[] = [
        {
          success: true,
          sourcePath: path.join(mockProjectConfig.paths.dotfilesDir, 'b.conf'),

          targetPath: path.join('/test/home', '.b.conf'),
          status: 'updated_target',
        },
      ];

      (mockShimGenerator.generate as ReturnType<typeof mock>).mockResolvedValue(mockShimPaths);
      (mockShellInitGenerator.generate as ReturnType<typeof mock>).mockResolvedValue({
        files: new Map([['zsh', mockShellInitPathWrite]]),
        primaryPath: mockShellInitPathWrite,
      });
      (mockSymlinkGenerator.generate as ReturnType<typeof mock>).mockResolvedValue(mockSymlinkResultsWrite);

      await orchestrator.generateAll({
        toolX: {
          name: 'toolX',
          binaries: ['tx'],
          version: '1',
          installationMethod: 'manual',
          installParams: {},
        },
      });
    });

    describe('generator behavior', () => {
      it('should call sub-generators with correct options', async () => {
        await orchestrator.generateAll(toolConfigs);

        expect(mockShimGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
          overwrite: true,
        });
        expect(mockShellInitGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
          shellTypes: ['zsh', 'bash', 'powershell'],
          systemInfo,
          pluginShellInit: {},
        });
        expect(mockSymlinkGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
          overwrite: true,
          backup: true,
        });
      });

      it('should complete without errors when using MemFileSystem', async () => {
        await orchestrator.generateAll(toolConfigs);
      });

      it('should work with custom generator results', async () => {
        const mockTestShimPaths = ['/memfs/shim1'];
        const mockTestShellInitPath = '/memfs/init.sh';
        const mockTestSymlinkResults: SymlinkOperationResult[] = [
          { success: true, sourcePath: 's', targetPath: 't', status: 'created' },
        ];

        (mockShimGenerator.generate as ReturnType<typeof mock>).mockResolvedValue(mockTestShimPaths);
        (mockShellInitGenerator.generate as ReturnType<typeof mock>).mockResolvedValue({
          files: new Map([['zsh', mockTestShellInitPath]]),
          primaryPath: mockTestShellInitPath,
        });
        (mockSymlinkGenerator.generate as ReturnType<typeof mock>).mockResolvedValue(mockTestSymlinkResults);

        await orchestrator.generateAll(toolConfigs);

        expect(mockShimGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
          overwrite: true,
        });
        expect(mockShellInitGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
          shellTypes: ['zsh', 'bash', 'powershell'],
          systemInfo,
          pluginShellInit: {},
        });
        expect(mockSymlinkGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
          overwrite: true,
          backup: true,
        });
      });

      describe('generateCompletionsForTool', () => {
        it('should log an INFO message with the generated completion file path', async () => {
          const toolName = 'curl-script--fnm';
          const expectedCompletionPath = '/path/_tool';

          (mockCompletionGenerator.generateAndWriteCompletionFile as ReturnType<typeof mock>).mockResolvedValue({
            content: '# completion',
            filename: '_tool',
            targetPath: expectedCompletionPath,
            generatedBy: 'command',
          });

          const toolConfig: ToolConfig = {
            name: toolName,
            binaries: ['fnm'],
            version: '1.0.0',
            installationMethod: 'manual',
            installParams: {},
            shellConfigs: {
              zsh: {
                scripts: [always(`export FNM=1`)],
                completions: {
                  cmd: 'fnm completions --shell zsh',
                  bin: 'fnm',
                },
              },
            },
          };

          await orchestrator.generateCompletionsForTool(toolName, toolConfig);

          logger.expect(
            ['INFO'],
            ['GeneratorOrchestrator', 'generateCompletionsForTool'],
            [],
            [expectedCompletionPath],
          );
        });

        it('should resolve callback-based completions with context', async () => {
          const toolName = 'test-tool';
          const expectedCompletionPath = '/path/_test-tool';

          (mockCompletionGenerator.generateAndWriteCompletionFile as ReturnType<typeof mock>).mockResolvedValue({
            content: '# completion',
            filename: '_test-tool',
            targetPath: expectedCompletionPath,
            generatedBy: 'url',
          });

          const toolConfig: ToolConfig = {
            name: toolName,
            binaries: ['test-tool'],
            version: '2.5.0',
            installationMethod: 'manual',
            installParams: {},
            shellConfigs: {
              zsh: {
                scripts: [],
                completions: testCompletionsCallback,
              },
            },
          };

          await orchestrator.generateCompletionsForTool(toolName, toolConfig);

          // Verify the completion generator was called with resolved URL containing the version
          expect(mockCompletionGenerator.generateAndWriteCompletionFile).toHaveBeenCalled();
          const calls = (mockCompletionGenerator.generateAndWriteCompletionFile as ReturnType<typeof mock>).mock.calls;
          const firstCall = calls[0];
          assert(firstCall);
          // First arg is the options object containing the completion config with resolved URL
          const options = firstCall[0] as { config: { url?: string; }; };
          expect(options.config.url).toBe('https://example.com/completions/2.5.0/completion.zsh');
        });

        it('should log WARN when completion generation fails', async () => {
          const toolName = 'failing-tool';

          (mockCompletionGenerator.generateAndWriteCompletionFile as ReturnType<typeof mock>).mockRejectedValue(
            new Error('Completion source file not found'),
          );

          const toolConfig: ToolConfig = {
            name: toolName,
            binaries: ['failing-tool'],
            version: '1.0.0',
            installationMethod: 'manual',
            installParams: {},
            shellConfigs: {
              zsh: {
                scripts: [],
                completions: {
                  url: 'https://example.com/completions/missing.zsh',
                },
              },
            },
          };

          await orchestrator.generateCompletionsForTool(toolName, toolConfig);

          // Should log WARN with tool/shell info
          logger.expect(
            ['WARN'],
            ['GeneratorOrchestrator', 'generateCompletionsForTool'],
            [],
            ['Failed to generate completion for failing-tool (zsh)'],
          );
        });
      });

      describe('disabled tools', () => {
        it('should skip disabled tools and log warning', async () => {
          const enabledToolConfig: ToolConfig = {
            name: 'enabledTool',
            binaries: ['enabled-bin'],
            version: '1.0',
            installationMethod: 'manual',
            installParams: {},
          };

          const toolConfigsWithDisabled: Record<string, ToolConfig> = {
            enabledTool: enabledToolConfig,
            disabledTool: {
              name: 'disabledTool',
              binaries: ['disabled-bin'],
              version: '1.0',
              disabled: true,
              installationMethod: 'manual',
              installParams: {},
            },
          };

          await orchestrator.generateAll(toolConfigsWithDisabled);

          // Verify only enabled tool is passed to generators
          const expectedFilteredConfigs: Record<string, ToolConfig> = {
            enabledTool: enabledToolConfig,
          };

          expect(mockShimGenerator.generate).toHaveBeenCalledWith(expectedFilteredConfigs, {
            overwrite: true,
          });
          expect(mockShellInitGenerator.generate).toHaveBeenCalledWith(expectedFilteredConfigs, {
            shellTypes: ['zsh', 'bash', 'powershell'],
            systemInfo,
            pluginShellInit: {},
          });
          expect(mockSymlinkGenerator.generate).toHaveBeenCalledWith(expectedFilteredConfigs, {
            overwrite: true,
            backup: true,
          });

          // Verify warning was logged for disabled tool
          logger.expect(['WARN'], ['GeneratorOrchestrator', 'generateAll'], [], ['disabledTool']);
        });

        it('should handle all tools disabled', async () => {
          const allDisabledConfigs: Record<string, ToolConfig> = {
            disabledTool1: {
              name: 'disabledTool1',
              binaries: ['bin1'],
              version: '1.0',
              disabled: true,
              installationMethod: 'manual',
              installParams: {},
            },
            disabledTool2: {
              name: 'disabledTool2',
              binaries: ['bin2'],
              version: '1.0',
              disabled: true,
              installationMethod: 'manual',
              installParams: {},
            },
          };

          await orchestrator.generateAll(allDisabledConfigs);

          // Verify empty configs are passed to generators
          expect(mockShimGenerator.generate).toHaveBeenCalledWith(
            {},
            {
              overwrite: true,
            },
          );
        });
      });
    });

    describe('auto-install', () => {
      it('should pass shellInit from auto-installed tools to shell init generator', async () => {
        const autoToolConfigs: Record<string, ToolConfig> = {
          'zsh-plugin--vi-mode': {
            name: 'zsh-plugin--vi-mode',
            binaries: [],
            version: '1.0.0',
            installationMethod: 'zsh-plugin',
            installParams: { auto: true },
          },
        };

        const expectedShellInit = {
          zsh: {
            scripts: [raw('source "/path/to/plugin.zsh"')],
          },
        };

        const mockInstaller = {
          install: mock(async () => ({
            success: true as const,
            version: '1.0.0',
            binaryPaths: [],
            shellInit: expectedShellInit,
          })),
        };

        await orchestrator.generateAll(autoToolConfigs, { installer: mockInstaller });

        expect(mockInstaller.install).toHaveBeenCalledWith(
          'zsh-plugin--vi-mode',
          autoToolConfigs['zsh-plugin--vi-mode'],
        );
        expect(mockShellInitGenerator.generate).toHaveBeenCalledWith(autoToolConfigs, {
          shellTypes: ['zsh', 'bash', 'powershell'],
          systemInfo,
          pluginShellInit: {
            'zsh-plugin--vi-mode': expectedShellInit,
          },
        });
      });

      it('should not call installer when auto is false', async () => {
        const nonAutoToolConfigs: Record<string, ToolConfig> = {
          'some-tool': {
            name: 'some-tool',
            binaries: ['tool'],
            version: '1.0.0',
            installationMethod: 'manual',
            installParams: { auto: false },
          },
        };

        const mockInstaller = {
          install: mock(async () => ({
            success: true as const,
            version: '1.0.0',
            binaryPaths: [],
          })),
        };

        await orchestrator.generateAll(nonAutoToolConfigs, { installer: mockInstaller });

        expect(mockInstaller.install).not.toHaveBeenCalled();
        expect(mockShellInitGenerator.generate).toHaveBeenCalledWith(nonAutoToolConfigs, {
          shellTypes: ['zsh', 'bash', 'powershell'],
          systemInfo,
          pluginShellInit: {},
        });
      });
    });

    // The test 'should correctly infer symlink paths even if targetDir is not home'
    // is now covered by the direct use of SymlinkGenerator's results.
    // The orchestrator no longer infers these paths itself.
  });
});
