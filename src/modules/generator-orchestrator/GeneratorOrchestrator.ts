/**
 * @file src/modules/generator-orchestrator/GeneratorOrchestrator.ts
 * @description Implementation of the GeneratorOrchestrator module.
 *
 * ## Development Plan
 *
 * ### Tasks
 * - [x] Implement constructor to accept dependencies: `IShimGenerator`, `IShellInitGenerator`, `ISymlinkGenerator`, `IFileSystem`, `AppConfig`.
 * - [x] Implement `generateAll` method:
 *   - [x] Determine manifest file path from `AppConfig.generatedArtifactsManifestPath`.
 *   - [x] Read existing manifest using `IFileSystem.readFile()` (behavior determined by injected `IFileSystem` type):
 *     - [x] Parse JSON.
 *     - [x] Handle case where manifest doesn't exist or is invalid (return a new/empty manifest structure).
 *   - [x] Call `shimGenerator.generate()`:
 *     - [x] Pass `toolConfigs`.
 *     - [x] Capture `Promise<string[]>` and store in manifest.
 *   - [x] Call `shellInitGenerator.generate()`:
 *     - [x] Pass `toolConfigs`.
 *     - [x] Capture `Promise<string | null>` and store in manifest.
 *   - [x] Call `symlinkGenerator.generate()`:
 *     - [x] Pass `toolConfigs`.
 *     - [x] Capture `Promise<SymlinkOperationResult[]>` and store in manifest.
 *   - [x] Update the `GeneratedArtifactsManifest` data structure:
 *     - [x] Use `lastGenerated` instead of `lastGenerationTimestamp`.
 *     - [x] Store detailed artifact information.
 *     - [x] Include `generatorVersion` if provided in options.
 *   - [x] Write the new/updated manifest to the file system using `IFileSystem.writeFile()` (behavior determined by injected `IFileSystem` type).
 *     - [x] Ensure parent directory for manifest exists.
 *     - [x] Serialize manifest to JSON string with indentation.
 *   - [x] Return the updated `GeneratedArtifactsManifest`.
 * - [x] Write unit tests (`__tests__/GeneratorOrchestrator.test.ts`).
 * - [x] Refactor dry run mechanism:
 *   - [x] Remove internal `dryRun` logic.
 *   - [x] Rely on injected `IFileSystem` for dry/real run behavior.
 *   - [x] Remove `dryRun` option from sub-generator calls.
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [x] Ensure 100% test coverage.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import path from 'node:path';
import type { IFileSystem } from '@modules/file-system';
import type { AppConfig, GeneratedArtifactsManifest, ToolConfig } from '@types';
import type { IShimGenerator, GenerateShimsOptions } from '@modules/generator-shim';
import type { IShellInitGenerator, GenerateShellInitOptions } from '@modules/generator-shell-init';
import type {
  ISymlinkGenerator,
  GenerateSymlinksOptions,
  SymlinkOperationResult,
} from '@modules/generator-symlink';
import type { IGeneratorOrchestrator, GenerateAllOptions } from './IGeneratorOrchestrator';
import { createLogger } from '@modules/logger';

const log = createLogger('GeneratorOrchestrator');

export class GeneratorOrchestrator implements IGeneratorOrchestrator {
  private readonly shimGenerator: IShimGenerator;
  private readonly shellInitGenerator: IShellInitGenerator;
  private readonly symlinkGenerator: ISymlinkGenerator;
  private readonly fs: IFileSystem;
  private readonly appConfig: AppConfig;

  constructor(
    shimGenerator: IShimGenerator,
    shellInitGenerator: IShellInitGenerator,
    symlinkGenerator: ISymlinkGenerator,
    fs: IFileSystem,
    appConfig: AppConfig
  ) {
    log('constructor: Initializing GeneratorOrchestrator.');
    this.shimGenerator = shimGenerator;
    this.shellInitGenerator = shellInitGenerator;
    this.symlinkGenerator = symlinkGenerator;
    this.fs = fs;
    this.appConfig = appConfig;
  }

  async generateAll(
    toolConfigs: Record<string, ToolConfig>,
    options?: GenerateAllOptions
  ): Promise<GeneratedArtifactsManifest> {
    log(
      'generateAll: Method entry. Options: %o, FileSystem: %s',
      options,
      this.fs.constructor.name
    );
    log(
      'generateAll: Initial appConfig.generatedArtifactsManifestPath: %s',
      this.appConfig?.generatedArtifactsManifestPath
    );

    const generatorVersion = options?.generatorVersion;
    const toolConfigsCount = toolConfigs ? Object.keys(toolConfigs).length : 0;

    log(
      `generateAll: Parsed options: generatorVersion=${generatorVersion}, toolConfigsCount=${toolConfigsCount}`
    );

    if (!this.appConfig) {
      log('generateAll: CRITICAL - this.appConfig is null/undefined at method start.');
      throw new Error('GeneratorOrchestrator: AppConfig is not available.');
    }
    log(
      'generateAll: AppConfig available. generatedArtifactsManifestPath: %s',
      this.appConfig.generatedArtifactsManifestPath
    );

    if (!this.appConfig.generatedArtifactsManifestPath) {
      log('generateAll: CRITICAL: generatedArtifactsManifestPath is undefined/null on appConfig.');
      throw new Error(
        'GeneratorOrchestrator: AppConfig.generatedArtifactsManifestPath is missing.'
      );
    }
    const manifestPath = this.appConfig.generatedArtifactsManifestPath;
    log(`generateAll: Manifest path determined as: ${manifestPath}`);

    let currentManifest: GeneratedArtifactsManifest;

    log('generateAll: Proceeding with manifest read/init using %s.', this.fs.constructor.name);
    try {
      const manifestFileExists = await this.fs.exists(manifestPath);
      log(`generateAll: fs.exists call completed. manifestFileExists = ${manifestFileExists}`);

      if (manifestFileExists) {
        log(`generateAll: Existing manifest found at ${manifestPath}. Reading...`);
        const fileContent = await this.fs.readFile(manifestPath);
        log('generateAll: readFile call completed.');
        currentManifest = JSON.parse(fileContent) as GeneratedArtifactsManifest;
        log('generateAll: Existing manifest read and parsed successfully.');
      } else {
        log(`generateAll: No existing manifest found at ${manifestPath}. Creating a new one.`);
        currentManifest = {
          lastGenerated: '', // Will be updated
          shims: [],
          symlinks: [],
          // shellInit will be populated by sub-generator
        };
      }
    } catch (error) {
      log(
        `generateAll: Error reading or parsing existing manifest at ${manifestPath}. Defaulting to a new manifest. Error: ${error instanceof Error ? error.message : String(error)}`
      );
      currentManifest = {
        lastGenerated: '', // Will be updated
        shims: [],
        symlinks: [],
      };
    }
    if (generatorVersion) {
      currentManifest.generatorVersion = generatorVersion;
    }

    // 1. Generate Shims
    // dryRun is removed; IFileSystem handles behavior
    const shimOptions: GenerateShimsOptions = { overwrite: true };
    log('generateAll: Calling shimGenerator.generate with options: %o', shimOptions);
    const generatedShimsPaths = await this.shimGenerator.generate(toolConfigs, shimOptions);
    currentManifest.shims = generatedShimsPaths;
    log(
      `generateAll: Shim generation complete. ${currentManifest.shims?.length ?? 0} shims recorded.`
    );

    // 2. Generate Shell Init
    // dryRun is removed; IFileSystem handles behavior
    const shellInitOptions: GenerateShellInitOptions = {}; // Add other options if any in future
    log('generateAll: Calling shellInitGenerator.generate with options: %o', shellInitOptions);
    const generatedShellInitPath = await this.shellInitGenerator.generate(
      toolConfigs,
      shellInitOptions
    );
    currentManifest.shellInit = { path: generatedShellInitPath };
    log(
      `generateAll: Shell init generation complete. Recorded path: ${currentManifest.shellInit?.path ?? 'null'}`
    );

    // 3. Generate Symlinks
    // dryRun is removed; IFileSystem handles behavior
    const symlinkOptions: GenerateSymlinksOptions = { overwrite: true, backup: true };
    log('generateAll: Calling symlinkGenerator.generate with options: %o', symlinkOptions);
    const symlinkResults: SymlinkOperationResult[] = await this.symlinkGenerator.generate(
      toolConfigs,
      symlinkOptions
    );
    currentManifest.symlinks = symlinkResults;
    log(
      `generateAll: Symlink generation complete. ${currentManifest.symlinks?.length ?? 0} symlink operations recorded.`
    );

    // Update timestamp
    currentManifest.lastGenerated = new Date().toISOString(); // Use new field name

    // Manifest writing behavior is now solely determined by the injected IFileSystem type
    try {
      log(
        'generateAll: Writing updated manifest to %s using %s',
        manifestPath,
        this.fs.constructor.name
      );
      const manifestDir = path.dirname(manifestPath);
      await this.fs.ensureDir(manifestDir);
      await this.fs.writeFile(manifestPath, JSON.stringify(currentManifest, null, 2));
      log('generateAll: Manifest written successfully.');
    } catch (error) {
      log(
        `generateAll: Failed to write manifest to ${manifestPath}. Error: ${error instanceof Error ? error.message : String(error)}`
      );
      // Potentially re-throw or handle more gracefully depending on requirements
    }

    log('generateAll: Orchestration complete using %s.', this.fs.constructor.name);
    return currentManifest;
  }
}
