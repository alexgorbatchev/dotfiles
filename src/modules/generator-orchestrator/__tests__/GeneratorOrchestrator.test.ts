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
 *   - [x] Mock `AppConfig`.
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
 *       - [x] Ensure `ensureDir` and `writeFile` are called with correct path and content.
 *       - [x] Ensure manifest is pretty-printed (JSON.stringify with indent).
 *     - [x] Test `dryRun` behavior:
 *       - [x] Sub-generators called with `dryRun: true`.
 *       - [x] No file system writes for manifest.
 *       - [x] Logs simulated actions (manifest content logged to console).
 *       - [x] Returns simulated manifest.
 *     - [x] Test with empty `toolConfigs`.
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [x] Ensure 100% test coverage.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import path from 'node:path';
import type { AppConfig, GeneratedArtifactsManifest, ToolConfig } from '../../../types';
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

  // Mock implementations
  let mockShimGenerate: ReturnType<typeof mock>;
  let mockShellInitGenerate: ReturnType<typeof mock>;
  let mockSymlinkGenerate: ReturnType<typeof mock>;
  let mockFsReadFile: ReturnType<typeof spyOn>;
  let mockFsWriteFile: ReturnType<typeof spyOn>;
  let mockFsExists: ReturnType<typeof spyOn>;
  let mockFsEnsureDir: ReturnType<typeof spyOn>;
  let consoleLogSpy: ReturnType<typeof spyOn>;

  const MOCK_GENERATED_DIR = '/test/home/.dotfiles/.generated';
  const MOCK_TARGET_DIR = '/usr/local/bin'; // For shims
  const MOCK_HOME_DIR = '/test/home'; // For symlink targets, shell init path resolution

  beforeEach(async () => {
    // Update mock generators to return new types
    mockShimGenerate = mock(async () => Promise.resolve([] as string[])); // Returns Promise<string[]>
    mockShellInitGenerate = mock(async () => Promise.resolve(null as string | null)); // Returns Promise<string | null>
    mockSymlinkGenerate = mock(async () => Promise.resolve([] as SymlinkOperationResult[])); // Returns Promise<SymlinkOperationResult[]>

    mockShimGenerator = {
      generate: mockShimGenerate,
      generateForTool: mock(async () => Promise.resolve([])),
    };
    mockShellInitGenerator = { generate: mockShellInitGenerate };
    mockSymlinkGenerator = { generate: mockSymlinkGenerate };

    mockFileSystem = new MemFileSystem();
    mockFsReadFile = spyOn(mockFileSystem, 'readFile');
    mockFsWriteFile = spyOn(mockFileSystem, 'writeFile');
    mockFsExists = spyOn(mockFileSystem, 'exists');
    mockFsEnsureDir = spyOn(mockFileSystem, 'ensureDir');

    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});

    const dotfilesDir = path.join(MOCK_HOME_DIR, '.dotfiles'); // Define for clarity

    mockAppConfig = {
      targetDir: MOCK_TARGET_DIR,
      dotfilesDir: dotfilesDir,
      generatedDir: MOCK_GENERATED_DIR,
      toolConfigDir: path.join(MOCK_HOME_DIR, '.dotfiles', 'generator', 'src', 'tools'),
      debug: '',
      cacheEnabled: false,
      sudoPrompt: undefined,
      cacheDir: path.join(MOCK_GENERATED_DIR, 'cache'),
      binariesDir: path.join(MOCK_GENERATED_DIR, 'binaries'),
      binDir: path.join(MOCK_GENERATED_DIR, 'bin'), // Actual binaries linked by shims
      zshInitDir: path.join(MOCK_GENERATED_DIR, 'zsh'),
      manifestPath: path.join(MOCK_GENERATED_DIR, 'tool-manifest.json'), // This is the old one, orchestrator uses its own
      completionsDir: path.join(MOCK_GENERATED_DIR, 'completions'),
      githubToken: undefined,
      checkUpdatesOnRun: false,
      updateCheckInterval: 0,
      downloadTimeout: 0,
      downloadRetryCount: 0,
      downloadRetryDelay: 0,
      githubClientUserAgent: 'test-agent',
      githubApiCacheEnabled: false,
      githubApiCacheTtl: 0,
      generatedArtifactsManifestPath: path.join(
        MOCK_GENERATED_DIR,
        'generated-artifacts-manifest.json'
      ),
    };

    // Ensure base directories used by appConfig and tests exist in MemFileSystem
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
      mockFsExists.mockResolvedValue(false); // No existing manifest
      await orchestrator.generateAll(toolConfigs);

      expect(mockShimGenerate).toHaveBeenCalledWith(toolConfigs, {
        dryRun: false,
        overwrite: true,
      });
      expect(mockShellInitGenerate).toHaveBeenCalledWith(toolConfigs, { dryRun: false });
      expect(mockSymlinkGenerate).toHaveBeenCalledWith(toolConfigs, {
        dryRun: false,
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
      mockFsExists.mockResolvedValue(true);
      mockFsReadFile.mockResolvedValue(JSON.stringify(existingManifest));

      const result = await orchestrator.generateAll(toolConfigs, { generatorVersion: '0.2.0' });

      expect(mockFsReadFile).toHaveBeenCalledWith(getExpectedManifestPath());
      expect(result.generatorVersion).toBe('0.2.0');
    });

    it('should handle no existing manifest', async () => {
      mockFsExists.mockResolvedValue(false);
      const result = await orchestrator.generateAll(toolConfigs, { generatorVersion: '0.1.0' });

      expect(mockFsReadFile).not.toHaveBeenCalled();
      expect(result.generatorVersion).toBe('0.1.0');
      expect(result.lastGenerated).toBeDefined();
    });

    it('should handle corrupted/invalid manifest by creating a new one', async () => {
      mockFsExists.mockResolvedValue(true);
      mockFsReadFile.mockResolvedValue('this is not json');

      const result = await orchestrator.generateAll(toolConfigs, { generatorVersion: '0.1.0' });

      expect(mockFsReadFile).toHaveBeenCalledWith(getExpectedManifestPath());
      expect(result.generatorVersion).toBe('0.1.0');
      expect(result.lastGenerated).toBeDefined();
      expect(result.shims?.length).toBeGreaterThanOrEqual(0); // Now uses direct results
    });

    it('should update manifest with generated artifact details from generator results', async () => {
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

      mockShimGenerate.mockResolvedValue(mockShimPaths);
      mockShellInitGenerate.mockResolvedValue(mockShellInitPath);
      mockSymlinkGenerate.mockResolvedValue(mockSymlinkResults);

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

      const mockShimPaths = [path.join(MOCK_TARGET_DIR, 'toolA-write')];
      const mockShellInitPathWrite = path.join(mockAppConfig.zshInitDir, 'init-write.zsh');
      const mockSymlinkResultsWrite: SymlinkOperationResult[] = [
        {
          sourcePath: path.join(mockAppConfig.dotfilesDir, 'b.conf'),
          targetPath: path.join(MOCK_HOME_DIR, '.b.conf'),
          status: 'updated_target',
        },
      ];

      mockShimGenerate.mockResolvedValue(mockShimPaths);
      mockShellInitGenerate.mockResolvedValue(mockShellInitPathWrite);
      mockSymlinkGenerate.mockResolvedValue(mockSymlinkResultsWrite);

      await orchestrator.generateAll({
        toolX: { name: 'toolX', binaries: ['tx'], version: '1' },
      });

      expect(mockFsEnsureDir).toHaveBeenCalledWith(path.dirname(getExpectedManifestPath()));
      expect(mockFsWriteFile).toHaveBeenCalledWith(
        getExpectedManifestPath(),
        expect.stringContaining('"lastGenerated":') // Check for new field name
      );

      const writtenContent = await mockFileSystem.readFile(getExpectedManifestPath());
      const parsedManifest = JSON.parse(writtenContent) as GeneratedArtifactsManifest;
      expect(parsedManifest.shims).toEqual(mockShimPaths);
      expect(parsedManifest.shellInit?.path).toEqual(mockShellInitPathWrite);
      expect(parsedManifest.symlinks).toEqual(mockSymlinkResultsWrite);
    });

    describe('dryRun behavior', () => {
      it('should call sub-generators with dryRun: true', async () => {
        await orchestrator.generateAll(toolConfigs, { dryRun: true });

        expect(mockShimGenerate).toHaveBeenCalledWith(toolConfigs, {
          dryRun: true,
          overwrite: true,
        });
        expect(mockShellInitGenerate).toHaveBeenCalledWith(toolConfigs, { dryRun: true });
        expect(mockSymlinkGenerate).toHaveBeenCalledWith(toolConfigs, {
          dryRun: true,
          overwrite: true,
          backup: true,
        });
      });

      it('should not write manifest to file system', async () => {
        mockFsEnsureDir.mockClear(); // Clear calls from beforeEach
        mockFsWriteFile.mockClear();
        await orchestrator.generateAll(toolConfigs, { dryRun: true });
        expect(mockFsWriteFile).not.toHaveBeenCalled();
        expect(mockFsEnsureDir).not.toHaveBeenCalledWith(path.dirname(getExpectedManifestPath()));
      });

      it('should log simulated manifest content to console', async () => {
        await orchestrator.generateAll(toolConfigs, {
          dryRun: true,
          generatorVersion: 'dry-run-v',
        });

        const consoleLogCalls = consoleLogSpy.mock.calls;
        expect(consoleLogCalls.length).toBeGreaterThanOrEqual(1); // Ensure console.log was called

        // The orchestrator's `log` utility (debug) is not spied by `consoleLogSpy`.
        // `consoleLogSpy` *only* captures the direct `console.log(JSON.stringify(currentManifest, null, 2));`
        const loggedJsonString = consoleLogCalls[0]?.[0] as string;
        expect(loggedJsonString).toBeDefined();

        if (loggedJsonString) {
          expect(loggedJsonString).toEqual(
            expect.stringContaining('"generatorVersion": "dry-run-v"')
          );
          // Check for the structure based on default mock returns (empty arrays/null path)
          expect(loggedJsonString).toEqual(expect.stringContaining('"shims": []'));
          expect(loggedJsonString).toEqual(expect.stringContaining('"symlinks": []'));
          expect(loggedJsonString).toEqual(
            expect.stringContaining('"shellInit": {\n    "path": null\n  }')
          );
        } else {
          // Fail test if loggedJsonString is not defined, to make it clear.
          throw new Error('console.log was not called with the expected JSON string.');
        }
      });

      it('should return a simulated manifest', async () => {
        // For this specific dryRun symlink inference test,
        // ensure appConfig.targetDir aligns with where ~ is expected to resolve (MOCK_HOME_DIR)
        // because the orchestrator's inference uses appConfig.targetDir for ~ resolution.
        const testSpecificAppConfig = { ...mockAppConfig, targetDir: MOCK_HOME_DIR };
        const localOrchestrator = new GeneratorOrchestrator(
          mockShimGenerator,
          mockShellInitGenerator,
          mockSymlinkGenerator,
          mockFileSystem,
          testSpecificAppConfig
        );
        const result = await localOrchestrator.generateAll(toolConfigs, {
          dryRun: true,
          generatorVersion: 'sim-v',
        });

        expect(result.generatorVersion).toBe('sim-v');
        expect(result.lastGenerated).toBeDefined(); // Use new field name

        // Mocked generator results for dry run
        const mockDryRunShimPaths = [
          path.join(MOCK_TARGET_DIR, 'toolA-dry'),
          path.join(MOCK_TARGET_DIR, 'toolB-dry'),
        ];
        const mockDryRunShellInitPath = path.join(mockAppConfig.zshInitDir, 'init-dry.zsh');
        const mockDryRunSymlinkResults: SymlinkOperationResult[] = [
          {
            sourcePath: 'a.conf-dry',
            targetPath: path.join(MOCK_HOME_DIR, '.a.conf-dry'),
            status: 'created',
          },
        ];

        mockShimGenerate.mockResolvedValue(mockDryRunShimPaths);
        mockShellInitGenerate.mockResolvedValue(mockDryRunShellInitPath);
        mockSymlinkGenerate.mockResolvedValue(mockDryRunSymlinkResults);

        // Re-run with the orchestrator that has the correct appConfig for this test
        const dryRunResult = await localOrchestrator.generateAll(toolConfigs, {
          dryRun: true,
          generatorVersion: 'sim-v',
        });

        expect(dryRunResult.shims).toEqual(mockDryRunShimPaths);
        expect(dryRunResult.shellInit?.path).toBe(mockDryRunShellInitPath);
        expect(dryRunResult.symlinks).toEqual(mockDryRunSymlinkResults);
      });
    });

    it('should handle empty toolConfigs gracefully', async () => {
      mockFsExists.mockResolvedValue(false);

      const expectedShellPath = path.join(mockAppConfig.zshInitDir, 'init.zsh');
      mockShimGenerate.mockResolvedValue([]);
      mockShellInitGenerate.mockResolvedValue(expectedShellPath); // Shell init might still run
      mockSymlinkGenerate.mockResolvedValue([]);

      const result = await orchestrator.generateAll({}, { generatorVersion: 'empty-test' });

      expect(result.shims).toEqual([]);
      expect(result.symlinks).toEqual([]);
      expect(result.shellInit?.path).toBe(expectedShellPath);
      expect(result.generatorVersion).toBe('empty-test');

      expect(mockFsWriteFile).toHaveBeenCalled(); // Manifest should still be written
    });

    // The test 'should correctly infer symlink paths even if targetDir is not home'
    // is now covered by the direct use of SymlinkGenerator's results.
    // The orchestrator no longer infers these paths itself.
  });
});
