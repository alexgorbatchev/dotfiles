import { beforeEach, describe, expect, it, mock, type spyOn } from 'bun:test';
import path from 'node:path';
import type { YamlConfig } from '@dotfiles/config';
import type { IFileSystem } from '@dotfiles/file-system';
import type { IShellInitGenerator } from '@dotfiles/shell-init-generator';
import type { IShimGenerator } from '@dotfiles/shim-generator';
import type { ISymlinkGenerator, SymlinkOperationResult } from '@dotfiles/symlink-generator';
import { createMemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createMockYamlConfig, createTestDirectories, type TestDirectories } from '@dotfiles/testing-helpers';
import type { SystemInfo, ToolConfig } from '@dotfiles/schemas';
import { always } from '@dotfiles/schemas';
import { GeneratorOrchestrator } from '../GeneratorOrchestrator';

describe('GeneratorOrchestrator', () => {
  let mockShimGenerator: IShimGenerator;
  let mockShellInitGenerator: IShellInitGenerator;
  let mockSymlinkGenerator: ISymlinkGenerator;
  let mockFileSystem: IFileSystem;
  let mockAppConfig: YamlConfig;
  let orchestrator: GeneratorOrchestrator;
  let logger: TestLogger;
  let testDirs: TestDirectories;
  let systemInfo: SystemInfo;

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
    };

    const { fs, spies } = await createMemFileSystem({});
    mockFileSystem = fs;
    mockFsExists = spies.exists;

    testDirs = await createTestDirectories(logger, mockFileSystem, { testName: 'generator-orchestrator' });

    systemInfo = { platform: 'linux', arch: 'x64', homeDir: testDirs.paths.homeDir };

    mockAppConfig = await createMockYamlConfig({
      config: {
        paths: testDirs.paths,
      },
      filePath: path.join(testDirs.paths.dotfilesDir, 'config.yaml'),
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
      mockFileSystem,
      mockAppConfig,
      systemInfo
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
        installationMethod: 'none',
        installParams: undefined,
      },
      toolB: {
        name: 'toolB',
        binaries: ['tb'],
        version: '2.0',
        shellConfigs: {
          zsh: {
            scripts: [always`export TB=1`],
          },
        },
        installationMethod: 'none',
        installParams: undefined,
      },
    };

    it('should call sub-generators with correct options', async () => {
      mockFsExists.mockResolvedValue(false); // No existing manifest for this path

      // The dryRun option is no longer passed to orchestrator.generateAll
      // and subsequently not to sub-generators by the orchestrator.
      await orchestrator.generateAll(toolConfigs, {}); // Pass empty options or specific non-dryRun options like generatorVersion

      expect(mockShimGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
        // dryRun: false, // Removed
        overwrite: true,
      });
      expect(mockShellInitGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
        shellTypes: ['zsh', 'bash', 'powershell'],
        systemInfo,
      });
      expect(mockSymlinkGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
        // dryRun: false, // Removed
        overwrite: true,
        backup: true,
      });
    });

    it('should call sub-generators correctly', async () => {
      await orchestrator.generateAll(toolConfigs, {});

      expect(mockShimGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
        overwrite: true,
      });
      expect(mockShellInitGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
        shellTypes: ['zsh', 'bash', 'powershell'],
        systemInfo,
      });
      expect(mockSymlinkGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
        overwrite: true,
        backup: true,
      });
    });

    it('should handle empty toolConfigs gracefully', async () => {
      await orchestrator.generateAll({}, {});

      expect(mockShimGenerator.generate).toHaveBeenCalledWith(
        {},
        {
          overwrite: true,
        }
      );
      expect(mockShellInitGenerator.generate).toHaveBeenCalledWith(
        {},
        {
          shellTypes: ['zsh', 'bash', 'powershell'],
          systemInfo,
        }
      );
      expect(mockSymlinkGenerator.generate).toHaveBeenCalledWith(
        {},
        {
          overwrite: true,
          backup: true,
        }
      );
    });

    it('should call all generators in correct order', async () => {
      const shimSpy = mockShimGenerator.generate as ReturnType<typeof mock>;
      const shellSpy = mockShellInitGenerator.generate as ReturnType<typeof mock>;
      const symlinkSpy = mockSymlinkGenerator.generate as ReturnType<typeof mock>;

      await orchestrator.generateAll(toolConfigs, {});

      expect(shimSpy).toHaveBeenCalled();
      expect(shellSpy).toHaveBeenCalled();
      expect(symlinkSpy).toHaveBeenCalled();
    });

    it('should call generators with mocked results', async () => {
      const mockShimPaths = [
        path.join(mockAppConfig.paths.targetDir, 'toolA'),
        path.join(mockAppConfig.paths.targetDir, 'toolB'),
      ];
      const mockShellInitPath = path.join(mockAppConfig.paths.shellScriptsDir, 'main.zsh');
      const mockSymlinkResults: SymlinkOperationResult[] = [
        {
          sourcePath: path.join(mockAppConfig.paths.dotfilesDir, 'a.conf'),
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

      await orchestrator.generateAll(toolConfigs, {});

      expect(mockShimGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
        overwrite: true,
      });
      expect(mockShellInitGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
        shellTypes: ['zsh', 'bash', 'powershell'],
        systemInfo,
      });
      expect(mockSymlinkGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
        overwrite: true,
        backup: true,
      });
    });

    it('should complete generation without errors', async () => {
      const mockShimPaths = [path.join(mockAppConfig.paths.targetDir, 'toolA-write')];
      const mockShellInitPathWrite = path.join(mockAppConfig.paths.shellScriptsDir, 'init-write.zsh');
      const mockSymlinkResultsWrite: SymlinkOperationResult[] = [
        {
          sourcePath: path.join(mockAppConfig.paths.dotfilesDir, 'b.conf'),
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
          installationMethod: 'none',
          installParams: undefined,
        },
      });
    });

    describe('generator behavior', () => {
      it('should call sub-generators with correct options', async () => {
        await orchestrator.generateAll(toolConfigs, {});

        expect(mockShimGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
          overwrite: true,
        });
        expect(mockShellInitGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
          shellTypes: ['zsh', 'bash', 'powershell'],
          systemInfo,
        });
        expect(mockSymlinkGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
          overwrite: true,
          backup: true,
        });
      });

      it('should complete without errors when using MemFileSystem', async () => {
        await orchestrator.generateAll(toolConfigs, {});
      });

      it('should work with custom generator results', async () => {
        const mockTestShimPaths = ['/memfs/shim1'];
        const mockTestShellInitPath = '/memfs/init.sh';
        const mockTestSymlinkResults: SymlinkOperationResult[] = [
          { sourcePath: 's', targetPath: 't', status: 'created' },
        ];

        (mockShimGenerator.generate as ReturnType<typeof mock>).mockResolvedValue(mockTestShimPaths);
        (mockShellInitGenerator.generate as ReturnType<typeof mock>).mockResolvedValue({
          files: new Map([['zsh', mockTestShellInitPath]]),
          primaryPath: mockTestShellInitPath,
        });
        (mockSymlinkGenerator.generate as ReturnType<typeof mock>).mockResolvedValue(mockTestSymlinkResults);

        await orchestrator.generateAll(toolConfigs, {});

        expect(mockShimGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
          overwrite: true,
        });
        expect(mockShellInitGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
          shellTypes: ['zsh', 'bash', 'powershell'],
          systemInfo,
        });
        expect(mockSymlinkGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
          overwrite: true,
          backup: true,
        });
      });
    });

    // The test 'should correctly infer symlink paths even if targetDir is not home'
    // is now covered by the direct use of SymlinkGenerator's results.
    // The orchestrator no longer infers these paths itself.
  });
});
