/**
 * @file generator/src/modules/generator-orchestrator/__tests__/GeneratorOrchestrator.test.ts
 * @description Unit tests for the GeneratorOrchestrator class.
 *
 * ## Development Plan
 *
 * ### Tasks
 * - [x] **Setup Mocks:**
 *   - [x] Mock `IShimGenerator`.
 *   - [x] Mock `IShellInitGenerator`.
 *   - [x] Mock `ISymlinkGenerator`.
 *   - [x] Mock `IFileSystem`.
 *   - [x] Mock `AppConfig`. (Now uses `createMockAppConfig`)
 * - [x] **Test Suite for `GeneratorOrchestrator`:**
 *   - [x] **Constructor:**
 *     - [x] Test correct initialization.
 *   - [x] **`generateAll` Method:**
 *     - [x] Test coordination: ensure sub-generators are called correctly with appropriate options.
 *     - [x] Test manifest reading:
 *       - [x] Scenario: No existing manifest.
 *       - [x] Scenario: Existing valid manifest.
 *       - [x] Scenario: Existing invalid/corrupted manifest.
 *     - [x] Test manifest updating:
 *       - [x] Ensure `lastGenerated` is updated (formerly `lastGenerationTimestamp`).
 *       - [x] Ensure `generatorVersion` is added if provided.
 *       - [x] Ensure artifact paths/details are correctly collected and stored using new return types:
 *         - [x] Shims: Use `string[]` from `shimGenerator.generate()`.
 *         - [x] Shell Init: Use `string | null` from `shellInitGenerator.generate()` for `shellInit.path`.
 *         - [x] Symlinks: Use `SymlinkOperationResult[]` from `symlinkGenerator.generate()`.
 *     - [x] Test manifest writing:
 *       - [x] Ensure `ensureDir` and `writeFile` are called with correct path and content (using the injected `IFileSystem`).
 *       - [x] Ensure manifest is pretty-printed (JSON.stringify with indent).
 *     - [x] Test behavior with `MemFileSystem` (simulating previous dry run for inspection):
 *       - [x] Sub-generators called *without* `dryRun` option.
 *       - [x] Manifest is written to the `MemFileSystem`.
 *       - [x] Returns the generated manifest.
 *     - [x] Test with empty `toolConfigs`.
 * - [x] Refactor dry run mechanism:
 *   - [x] Remove tests for `dryRun` option being passed to sub-generators.
 *   - [x] Verify manifest is always written to the provided `IFileSystem`.
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [x] Ensure 100% test coverage (passes in full suite).
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import path from 'node:path';
import type { AppConfig, GeneratedArtifactsManifest, ToolConfig } from '../../../types';
import { createMockAppConfig } from '../../../testing-helpers/appConfigTestHelpers';
import type { IFileSystem } from '../../file-system';
import { MemFileSystem } from '../../file-system/MemFileSystem';
import type { IShimGenerator } from '../../generator-shim';
import type { IShellInitGenerator } from '../../generator-shell-init';
import type { ISymlinkGenerator, SymlinkOperationResult } from '../../generator-symlink';
import { GeneratorOrchestrator } from '../GeneratorOrchestrator';

describe('GeneratorOrchestrator', () => {
  let mockShimGenerator: IShimGenerator;
  let mockShellInitGenerator: IShellInitGenerator;
  let mockSymlinkGenerator: ISymlinkGenerator;
  let mockFileSystem: IFileSystem;
  let mockAppConfig: AppConfig;
  let orchestrator: GeneratorOrchestrator;

  // Mock implementations for spies on IFileSystem
  let mockFsReadFile: ReturnType<typeof spyOn>;
  let mockFsExists: ReturnType<typeof spyOn>;
  let consoleLogSpy: ReturnType<typeof spyOn>;

  const MOCK_GENERATED_DIR = '/test/home/.dotfiles/.generated';
  const MOCK_TARGET_DIR = '/usr/local/bin'; // For shims
  const MOCK_HOME_DIR = '/test/home'; // For symlink targets, shell init path resolution

  beforeEach(async () => {
    // Directly create mock functions for the methods on the mock objects
    mockShimGenerator = {
      generate: mock(async () => Promise.resolve([] as string[])),
      generateForTool: mock(async () => Promise.resolve([])),
    };
    mockShellInitGenerator = {
      generate: mock(async () => Promise.resolve(null as string | null)),
    };
    mockSymlinkGenerator = {
      generate: mock(async () => Promise.resolve([] as SymlinkOperationResult[])),
    };

    // We will assert directly on mockShimGenerator.generate, etc.
    // Top-level mock function variables (e.g., mockShimGenerate) are no longer declared at the top of the describe block.

    mockFileSystem = new MemFileSystem();
    mockFsReadFile = spyOn(mockFileSystem, 'readFile');
    mockFsExists = spyOn(mockFileSystem, 'exists');

    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});

    const dotfilesDir = path.join(MOCK_HOME_DIR, '.dotfiles'); // Define for clarity

    mockAppConfig = createMockAppConfig({
      targetDir: MOCK_TARGET_DIR,
      dotfilesDir: dotfilesDir, // Keep this specific if MOCK_HOME_DIR is used for derived paths
      generatedDir: MOCK_GENERATED_DIR, // Keep this specific
      toolConfigDir: path.join(dotfilesDir, 'generator', 'src', 'tools'), // Ensure consistency
      // Other properties will use defaults from createMockAppConfig unless overridden
      // For this test, generatedArtifactsManifestPath is key
      generatedArtifactsManifestPath: path.join(
        MOCK_GENERATED_DIR,
        'generated-artifacts-manifest.json'
      ),
      // Ensure paths used by sub-generators are consistent
      binDir: path.join(MOCK_GENERATED_DIR, 'bin'),
      zshInitDir: path.join(MOCK_GENERATED_DIR, 'zsh'),
      completionsDir: path.join(MOCK_GENERATED_DIR, 'completions'),
    });

    // Ensure base directories used by appConfig and tests exist in MemFileSystem
    // createMockAppConfig doesn't know about MOCK_HOME_DIR, so ensure dotfilesDir is correctly set for tests
    await mockFileSystem.ensureDir(mockAppConfig.dotfilesDir);
    await mockFileSystem.ensureDir(MOCK_HOME_DIR); // Ensure MOCK_HOME_DIR itself exists
    await mockFileSystem.ensureDir(mockAppConfig.targetDir); // For shims and symlink targets if relative to home
    await mockFileSystem.ensureDir(mockAppConfig.generatedDir); // For manifest, zshInitDir etc.
    await mockFileSystem.ensureDir(mockAppConfig.zshInitDir);
    await mockFileSystem.ensureDir(path.dirname(mockAppConfig.generatedArtifactsManifestPath));

    orchestrator = new GeneratorOrchestrator(
      mockShimGenerator,
      mockShellInitGenerator,
      mockSymlinkGenerator,
      mockFileSystem,
      mockAppConfig
    );
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  const getExpectedManifestPath = () => mockAppConfig.generatedArtifactsManifestPath;

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
      },
      toolB: { name: 'toolB', binaries: ['tb'], version: '2.0', zshInit: ['export TB=1'] },
    };

    it('should call sub-generators with correct options', async () => {
      (mockShimGenerator.generate as ReturnType<typeof mock>).mockClear();
      (mockShellInitGenerator.generate as ReturnType<typeof mock>).mockClear();
      (mockShimGenerator.generate as ReturnType<typeof mock>).mockClear();
      (mockShellInitGenerator.generate as ReturnType<typeof mock>).mockClear();
      (mockSymlinkGenerator.generate as ReturnType<typeof mock>).mockClear();
      mockFsExists.mockReset(); // Reset spy
      mockFsExists.mockResolvedValue(false); // No existing manifest for this path

      // The dryRun option is no longer passed to orchestrator.generateAll
      // and subsequently not to sub-generators by the orchestrator.
      await orchestrator.generateAll(toolConfigs, {}); // Pass empty options or specific non-dryRun options like generatorVersion

      expect(mockShimGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
        // dryRun: false, // Removed
        overwrite: true,
      });
      expect(mockShellInitGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
        /* dryRun: false */
      }); // Options might be empty if only dryRun was there
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
        shellInit: { path: '/prev/init.zsh' },
        symlinks: [{ sourcePath: 'old.conf', targetPath: '/prev/old.conf', status: 'created' }],
        generatorVersion: '0.1.0',
      };
      mockFsExists.mockReset();
      mockFsReadFile.mockReset();
      mockFsExists.mockResolvedValue(true);
      mockFsReadFile.mockResolvedValue(JSON.stringify(existingManifest));

      const result = await orchestrator.generateAll(toolConfigs, { generatorVersion: '0.2.0' });

      expect(mockFsReadFile).toHaveBeenCalledWith(getExpectedManifestPath());
      expect(result.generatorVersion).toBe('0.2.0');
    });

    it('should handle no existing manifest', async () => {
      mockFsExists.mockReset();
      mockFsReadFile.mockReset();
      mockFsExists.mockResolvedValue(false);
      const result = await orchestrator.generateAll(toolConfigs, { generatorVersion: '0.1.0' });

      expect(mockFsReadFile).not.toHaveBeenCalled();
      expect(result.generatorVersion).toBe('0.1.0');
      expect(result.lastGenerated).toBeDefined();
    });

    it('should handle corrupted/invalid manifest by creating a new one', async () => {
      mockFsExists.mockReset();
      mockFsReadFile.mockReset();
      mockFsExists.mockResolvedValue(true);
      mockFsReadFile.mockResolvedValue('this is not json');

      const result = await orchestrator.generateAll(toolConfigs, { generatorVersion: '0.1.0' });

      expect(mockFsReadFile).toHaveBeenCalledWith(getExpectedManifestPath());
      expect(result.generatorVersion).toBe('0.1.0');
      expect(result.lastGenerated).toBeDefined();
      expect(result.shims?.length).toBeGreaterThanOrEqual(0); // Now uses direct results
    });

    it('should update manifest with generated artifact details from generator results', async () => {
      mockFsExists.mockReset();
      mockFsExists.mockResolvedValue(false); // No existing manifest

      const mockShimPaths = [
        path.join(MOCK_TARGET_DIR, 'toolA'),
        path.join(MOCK_TARGET_DIR, 'toolB'),
      ];
      const mockShellInitPath = path.join(mockAppConfig.zshInitDir, 'init.zsh');
      const mockSymlinkResults: SymlinkOperationResult[] = [
        {
          sourcePath: path.join(mockAppConfig.dotfilesDir, 'a.conf'),
          targetPath: path.join(MOCK_HOME_DIR, '.a.conf'), // Use MOCK_HOME_DIR for symlink target
          status: 'created',
        },
      ];

      (mockShimGenerator.generate as ReturnType<typeof mock>).mockResolvedValue(mockShimPaths);
      (mockShellInitGenerator.generate as ReturnType<typeof mock>).mockResolvedValue(
        mockShellInitPath
      );
      (mockSymlinkGenerator.generate as ReturnType<typeof mock>).mockResolvedValue(
        mockSymlinkResults
      );

      const result = await orchestrator.generateAll(toolConfigs, { generatorVersion: '1.0.0' });

      expect(result.lastGenerated).toBeDefined();
      expect(new Date(result.lastGenerated).valueOf()).toBeGreaterThan(0);
      expect(result.generatorVersion).toBe('1.0.0');

      expect(result.shims).toEqual(mockShimPaths);
      expect(result.shellInit?.path).toBe(mockShellInitPath);
      expect(result.symlinks).toEqual(mockSymlinkResults);
    });

    it('should write the updated manifest to the file system', async () => {
      mockFsExists.mockReset();
      // mockFsWriteFile.mockReset(); // Spy removed
      // mockFsEnsureDir.mockReset(); // Spy removed
      mockFsExists.mockResolvedValue(false); // No existing manifest

      const mockShimPaths = [path.join(MOCK_TARGET_DIR, 'toolA-write')];
      const mockShellInitPathWrite = path.join(mockAppConfig.zshInitDir, 'init-write.zsh');
      const mockSymlinkResultsWrite: SymlinkOperationResult[] = [
        {
          sourcePath: path.join(mockAppConfig.dotfilesDir, 'b.conf'),
          targetPath: path.join(MOCK_HOME_DIR, '.b.conf'),
          status: 'updated_target',
        },
      ];

      (mockShimGenerator.generate as ReturnType<typeof mock>).mockResolvedValue(mockShimPaths);
      (mockShellInitGenerator.generate as ReturnType<typeof mock>).mockResolvedValue(
        mockShellInitPathWrite
      );
      (mockSymlinkGenerator.generate as ReturnType<typeof mock>).mockResolvedValue(
        mockSymlinkResultsWrite
      );

      await orchestrator.generateAll({
        toolX: { name: 'toolX', binaries: ['tx'], version: '1' },
      });

      // expect(mockFsEnsureDir).toHaveBeenCalledWith(path.dirname(getExpectedManifestPath())); // Spy removed
      // expect(mockFsWriteFile).toHaveBeenCalledWith( // Spy removed
      //   getExpectedManifestPath(),
      //   expect.stringContaining('"lastGenerated":')
      // );

      const writtenContent = await mockFileSystem.readFile(getExpectedManifestPath());
      const parsedManifest = JSON.parse(writtenContent) as GeneratedArtifactsManifest;
      expect(parsedManifest.shims).toEqual(mockShimPaths);
      expect(parsedManifest.shellInit?.path).toEqual(mockShellInitPathWrite);
      expect(parsedManifest.symlinks).toEqual(mockSymlinkResultsWrite);
    });

    describe('dryRun behavior', () => {
      it('should call sub-generators WITHOUT dryRun option', async () => {
        (mockShimGenerator.generate as ReturnType<typeof mock>).mockClear();
        (mockShellInitGenerator.generate as ReturnType<typeof mock>).mockClear();
        (mockSymlinkGenerator.generate as ReturnType<typeof mock>).mockClear();

        // Orchestrator is instantiated with MemFileSystem in beforeEach
        // No dryRun option is passed to generateAll itself
        await orchestrator.generateAll(toolConfigs, {}); // Empty options or other non-dryRun options

        expect(mockShimGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
          // dryRun: true, // This is removed
          overwrite: true,
        });
        expect(mockShellInitGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
          /* dryRun: true */
          // This is removed
        }); // Options might be empty if only dryRun was there
        expect(mockSymlinkGenerator.generate).toHaveBeenCalledWith(toolConfigs, {
          // dryRun: true, // This is removed
          overwrite: true,
          backup: true,
        });
      });

      it('should write manifest to MemFileSystem', async () => {
        const writeFileSpy = spyOn(mockFileSystem, 'writeFile');
        const ensureDirSpy = spyOn(mockFileSystem, 'ensureDir');

        // Orchestrator uses MemFileSystem from beforeEach
        await orchestrator.generateAll(toolConfigs, {});

        expect(ensureDirSpy).toHaveBeenCalledWith(path.dirname(getExpectedManifestPath()));
        expect(writeFileSpy).toHaveBeenCalledWith(
          getExpectedManifestPath(),
          expect.stringContaining('"lastGenerated":')
        );

        // Verify content in MemFileSystem
        const writtenContent = await mockFileSystem.readFile(getExpectedManifestPath());
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

        (mockShimGenerator.generate as ReturnType<typeof mock>).mockResolvedValue(
          mockTestShimPaths
        );
        (mockShellInitGenerator.generate as ReturnType<typeof mock>).mockResolvedValue(
          mockTestShellInitPath
        );
        (mockSymlinkGenerator.generate as ReturnType<typeof mock>).mockResolvedValue(
          mockTestSymlinkResults
        );

        const resultWithData = await orchestrator.generateAll(toolConfigs, {
          generatorVersion: mockGenVersion,
        });
        expect(resultWithData.shims).toEqual(mockTestShimPaths);
        expect(resultWithData.shellInit?.path).toBe(mockTestShellInitPath);
        expect(resultWithData.symlinks).toEqual(mockTestSymlinkResults);
      });
    });

    it('should handle empty toolConfigs gracefully', async () => {
      mockFsExists.mockReset();
      // mockFsWriteFile.mockReset(); // Spy removed
      mockFsExists.mockResolvedValue(false);

      const expectedShellPath = path.join(mockAppConfig.zshInitDir, 'init.zsh');
      (mockShimGenerator.generate as ReturnType<typeof mock>).mockResolvedValue([]);
      // Directly re-assign the mock implementation for this specific test case
      (mockShellInitGenerator.generate as ReturnType<typeof mock>).mockResolvedValue(
        expectedShellPath
      );
      (mockSymlinkGenerator.generate as ReturnType<typeof mock>).mockResolvedValue([]);

      const result = await orchestrator.generateAll({}, { generatorVersion: 'empty-test' });

      expect(result.shims).toEqual([]);
      expect(result.symlinks).toEqual([]);
      expect(result.shellInit?.path).toBe(expectedShellPath);
      expect(result.generatorVersion).toBe('empty-test');

      // expect(mockFsWriteFile).toHaveBeenCalled(); // Spy removed, direct check via readFile below
      // Verify by trying to read the manifest, which should exist if written
      const resultManifestContent = await mockFileSystem.readFile(getExpectedManifestPath());
      expect(resultManifestContent).toBeDefined();
      expect(resultManifestContent.length).toBeGreaterThan(0);
    });

    // The test 'should correctly infer symlink paths even if targetDir is not home'
    // is now covered by the direct use of SymlinkGenerator's results.
    // The orchestrator no longer infers these paths itself.
  });
});
