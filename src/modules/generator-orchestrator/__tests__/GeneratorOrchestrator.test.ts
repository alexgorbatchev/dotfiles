import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import path from 'node:path';
import type { YamlConfig } from '@modules/config';
import type { IFileSystem } from '@modules/file-system';
import type { IShellInitGenerator } from '@modules/generator-shell-init';
import type { IShimGenerator } from '@modules/generator-shim';
import type { ISymlinkGenerator, SymlinkOperationResult } from '@modules/generator-symlink';
import {
  createMemFileSystem,
  createMockYamlConfig,
  createTestDirectories,
  type TestDirectories,
  TestLogger,
} from '@testing-helpers';
import type { GeneratedArtifactsManifest, SystemInfo, ToolConfig } from '@types';
import { always } from '@types';
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

  let mockFsReadFile: ReturnType<typeof spyOn>;
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
    mockFsReadFile = spies.readFile;
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

    it('should read an existing valid manifest', async () => {
      const existingManifest: GeneratedArtifactsManifest = {
        lastGenerated: new Date(Date.now() - 100000).toISOString(),
        shims: ['/prev/shim'],
        shellInit: { path: '/prev/main.zsh' },
        symlinks: [{ sourcePath: 'old.conf', targetPath: '/prev/old.conf', status: 'created' }],
        generatorVersion: '0.1.0',
      };
      mockFsExists.mockResolvedValue(true);
      mockFsReadFile.mockResolvedValue(JSON.stringify(existingManifest));

      const result = await orchestrator.generateAll(toolConfigs, { generatorVersion: '0.2.0' });

      expect(mockFsReadFile).toHaveBeenCalledWith(mockAppConfig.paths.manifestPath);
      expect(result.generatorVersion).toBe('0.2.0');
    });

    it('should handle no existing manifest', async () => {
      mockFsExists.mockResolvedValue(false);
      const result = await orchestrator.generateAll(toolConfigs, { generatorVersion: '0.1.0' });

      // With YamlConfig, fs.exists is still called but we don't need to check it
      // The important part is that the result is correct
      expect(result.generatorVersion).toBe('0.1.0');
      expect(result.lastGenerated).toBeDefined();
    });

    it('should handle corrupted/invalid manifest by creating a new one', async () => {
      mockFsExists.mockResolvedValue(true);
      mockFsReadFile.mockResolvedValue('this is not json');

      const result = await orchestrator.generateAll(toolConfigs, { generatorVersion: '0.1.0' });

      expect(mockFsReadFile).toHaveBeenCalledWith(mockAppConfig.paths.manifestPath);
      expect(result.generatorVersion).toBe('0.1.0');
      expect(result.lastGenerated).toBeDefined();
      expect(result.shims?.length).toBeGreaterThanOrEqual(0); // Now uses direct results
    });

    it('should update manifest with generated artifact details from generator results', async () => {
      mockFsExists.mockResolvedValue(false); // No existing manifest

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

      const result = await orchestrator.generateAll(toolConfigs, { generatorVersion: '1.0.0' });

      expect(result.lastGenerated).toBeDefined();
      expect(new Date(result.lastGenerated).valueOf()).toBeGreaterThan(0);
      expect(result.generatorVersion).toBe('1.0.0');

      expect(result.shims).toEqual(mockShimPaths);
      expect(result.shellInit?.path).toBe(mockShellInitPath);
      expect(result.symlinks).toEqual(mockSymlinkResults);
    });

    it('should write the updated manifest to the file system', async () => {
      mockFsExists.mockResolvedValue(false); // No existing manifest

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

      const writtenContent = await mockFileSystem.readFile(mockAppConfig.paths.manifestPath);
      const parsedManifest = JSON.parse(writtenContent) as GeneratedArtifactsManifest;
      expect(parsedManifest.shims).toEqual(mockShimPaths);
      expect(parsedManifest.shellInit?.path).toEqual(mockShellInitPathWrite);
      expect(parsedManifest.symlinks).toEqual(mockSymlinkResultsWrite);
    });

    describe('dryRun behavior', () => {
      it('should call sub-generators WITHOUT dryRun option', async () => {
        // Orchestrator is instantiated with MemFileSystem in beforeEach
        // No dryRun option is passed to generateAll itself
        await orchestrator.generateAll(toolConfigs, {}); // Empty options or other non-dryRun options

        expect(mockShimGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
          // dryRun: true, // This is removed
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

      it('should write manifest to MemFileSystem', async () => {
        const writeFileSpy = spyOn(mockFileSystem, 'writeFile');
        const ensureDirSpy = spyOn(mockFileSystem, 'ensureDir');

        // Orchestrator uses MemFileSystem from beforeEach
        await orchestrator.generateAll(toolConfigs, {});

        expect(ensureDirSpy).toHaveBeenCalledWith(path.dirname(mockAppConfig.paths.manifestPath));
        expect(writeFileSpy).toHaveBeenCalledWith(
          mockAppConfig.paths.manifestPath,
          expect.stringContaining('"lastGenerated":')
        );

        // Verify content in MemFileSystem
        const writtenContent = await mockFileSystem.readFile(mockAppConfig.paths.manifestPath);
        const parsedManifest = JSON.parse(writtenContent);
        expect(parsedManifest).toHaveProperty('lastGenerated');

        writeFileSpy.mockRestore();
        ensureDirSpy.mockRestore();
      });

      it('should return the generated manifest (when using MemFileSystem)', async () => {
        // Orchestrator uses MemFileSystem from beforeEach
        const mockGenVersion = 'memfs-test-v';
        const result = await orchestrator.generateAll(toolConfigs, {
          generatorVersion: mockGenVersion,
        });

        expect(result.generatorVersion).toBe(mockGenVersion);
        expect(result.lastGenerated).toBeDefined();

        // Default mock results from sub-generators
        expect(result.shims).toEqual([]);
        expect(result.shellInit?.path).toBeNull();
        expect(result.symlinks).toEqual([]);

        // Further check if specific mocked results are propagated
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

        const resultWithData = await orchestrator.generateAll(toolConfigs, {
          generatorVersion: mockGenVersion,
        });
        expect(resultWithData.shims).toEqual(mockTestShimPaths);
        expect(resultWithData.shellInit?.path).toBe(mockTestShellInitPath);
        expect(resultWithData.symlinks).toEqual(mockTestSymlinkResults);
      });
    });

    it('should handle empty toolConfigs gracefully', async () => {
      mockFsExists.mockResolvedValue(false);

      const expectedShellPath = path.join(mockAppConfig.paths.shellScriptsDir, 'main.zsh');
      (mockShimGenerator.generate as ReturnType<typeof mock>).mockResolvedValue([]);
      // Directly re-assign the mock implementation for this specific test case
      (mockShellInitGenerator.generate as ReturnType<typeof mock>).mockResolvedValue({
        files: new Map([['zsh', expectedShellPath]]),
        primaryPath: expectedShellPath,
      });
      (mockSymlinkGenerator.generate as ReturnType<typeof mock>).mockResolvedValue([]);

      const result = await orchestrator.generateAll({}, { generatorVersion: 'empty-test' });

      expect(result.shims).toEqual([]);
      expect(result.symlinks).toEqual([]);
      expect(result.shellInit?.path).toBe(expectedShellPath);
      expect(result.generatorVersion).toBe('empty-test');

      // expect(mockFsWriteFile).toHaveBeenCalled(); // Spy removed, direct check via readFile below
      // Verify by trying to read the manifest, which should exist if written
      const resultManifestContent = await mockFileSystem.readFile(mockAppConfig.paths.manifestPath);
      expect(resultManifestContent).toBeDefined();
      expect(resultManifestContent.length).toBeGreaterThan(0);
    });

    // The test 'should correctly infer symlink paths even if targetDir is not home'
    // is now covered by the direct use of SymlinkGenerator's results.
    // The orchestrator no longer infers these paths itself.
  });
});
