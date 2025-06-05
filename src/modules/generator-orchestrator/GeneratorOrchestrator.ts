/**
 * @file generator/src/modules/generator-orchestrator/GeneratorOrchestrator.ts
 * @description Implementation of the GeneratorOrchestrator module.
 *
 * ## Development Plan
 *
 * ### Tasks
 * - [x] Implement constructor to accept dependencies: `IShimGenerator`, `IShellInitGenerator`, `ISymlinkGenerator`, `IFileSystem`, `AppConfig`.
 * - [x] Implement `generateAll` method:
 *   - [x] Determine manifest file path from `AppConfig.generatedArtifactsManifestPath`.
 *   - [x] Handle `dryRun` option:
 *     - [x] Log actions instead of performing file system operations.
 *     - [x] Call sub-generators with `dryRun` if they support it (assume they do for now, or adapt).
 *     - [x] Simulate manifest reading/writing.
 *   - [x] Read existing manifest using `IFileSystem.readFile()`:
 *     - [x] Parse JSON.
 *     - [x] Handle case where manifest doesn't exist or is invalid (return a new/empty manifest structure).
 *   - [x] Call `shimGenerator.generate()`:
 *     - [x] Pass `toolConfigs` and `dryRun` option.
 *     - [x] Collect generated shim paths (assume `shimGenerator.generate` returns them or they can be inferred).
 *   - [x] Call `shellInitGenerator.generate()`:
 *     - [x] Pass `toolConfigs` and `dryRun` option.
 *     - [x] Collect generated shell init file path.
 *   - [x] Call `symlinkGenerator.generate()`:
 *     - [x] Pass `toolConfigs` and `dryRun` option.
 *     - [x] Collect generated symlink details (inferred from `toolConfigs` as `generate` returns `void`).
 *   - [x] Update the `GeneratedArtifactsManifest` data structure:
 *     - [x] Set `lastGenerationTimestamp`.
 *     - [x] Store collected shim paths, shell init path, and symlink details.
 *     - [x] Include `generatorVersion` if provided in options.
 *   - [x] Write the new/updated manifest to the file system using `IFileSystem.writeFile()` (unless `dryRun`).
 *     - [x] Ensure parent directory for manifest exists.
 *     - [x] Serialize manifest to JSON string with indentation.
 *   - [x] Return the updated (or simulated if dryRun) `GeneratedArtifactsManifest`.
 * - [x] Write unit tests (`__tests__/GeneratorOrchestrator.test.ts`).
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [x] Ensure 100% test coverage.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import path from 'node:path';
import type { IFileSystem } from '../file-system';
import type { AppConfig, GeneratedArtifactsManifest, ToolConfig } from '../../types';
import type { IShimGenerator, GenerateShimsOptions } from '../generator-shim';
import type { IShellInitGenerator, GenerateShellInitOptions } from '../generator-shell-init';
import type {
  ISymlinkGenerator,
  GenerateSymlinksOptions,
  // SymlinkResult is not exported by ISymlinkGenerator as its generate method returns void
} from '../generator-symlink';
import type { IGeneratorOrchestrator, GenerateAllOptions } from './IGeneratorOrchestrator';
import { createLogger } from '../logger';

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
    const dryRun = options?.dryRun ?? false;
    const generatorVersion = options?.generatorVersion;
    log(
      `generateAll: Starting generation. dryRun=${dryRun}, generatorVersion=${generatorVersion}, toolConfigsCount=${Object.keys(toolConfigs).length}`
    );

    const manifestPath = this.appConfig.generatedArtifactsManifestPath;
    log(`generateAll: Manifest path determined as: ${manifestPath}`);

    let currentManifest: GeneratedArtifactsManifest;

    if (dryRun) {
      log('generateAll: [DRY RUN] Simulating reading existing manifest.');
      // In a dry run, we'd typically start with a blank or placeholder manifest
      // or simulate reading one if its content influenced dry run logic.
      // For now, assume a fresh manifest structure for dry run output.
      currentManifest = {
        lastGenerationTimestamp: new Date().toISOString(),
        generatedShims: [],
        generatedSymlinks: [],
        ...(generatorVersion && { generatorVersion }),
      };
    } else {
      try {
        if (await this.fs.exists(manifestPath)) {
          log(`generateAll: Existing manifest found at ${manifestPath}. Reading...`);
          const fileContent = await this.fs.readFile(manifestPath);
          currentManifest = JSON.parse(fileContent) as GeneratedArtifactsManifest;
          log('generateAll: Existing manifest read and parsed successfully.');
        } else {
          log(`generateAll: No existing manifest found at ${manifestPath}. Creating a new one.`);
          currentManifest = {
            lastGenerationTimestamp: '', // Will be updated
            generatedShims: [],
            generatedSymlinks: [],
          };
        }
      } catch (error) {
        log(
          `generateAll: Error reading or parsing existing manifest at ${manifestPath}. Defaulting to a new manifest. Error: ${error instanceof Error ? error.message : String(error)}`
        );
        currentManifest = {
          lastGenerationTimestamp: '', // Will be updated
          generatedShims: [],
          generatedSymlinks: [],
        };
      }
      if (generatorVersion) {
        currentManifest.generatorVersion = generatorVersion;
      }
    }

    // 1. Generate Shims
    const shimOptions: GenerateShimsOptions = { dryRun, overwrite: true }; // Assuming overwrite for orchestrator
    log('generateAll: Calling shimGenerator.generate...', shimOptions);
    await this.shimGenerator.generate(toolConfigs, shimOptions); // Returns void

    const generatedShimsPaths: string[] = [];
    // In dryRun, list all intended shims. Otherwise, list shims for tools that likely got processed.
    // This is an approximation as shimGenerator.generate returns void.
    // A more robust approach would be for shimGenerator to return results.
    for (const toolName of Object.keys(toolConfigs)) {
      // ShimGenerator creates shims in appConfig.targetDir (e.g. /usr/local/bin or a dedicated shim dir)
      // and names them after the toolName.
      // The actual binary path is appConfig.binDir/toolBinaryName
      generatedShimsPaths.push(path.join(this.appConfig.targetDir, toolName));
    }
    currentManifest.generatedShims = generatedShimsPaths;
    log(
      `generateAll: Shim generation complete. ${currentManifest.generatedShims.length} shims recorded/intended.`
    );

    // 2. Generate Shell Init
    const shellInitOptions: GenerateShellInitOptions = { dryRun };
    // Default path, ShellInitGenerator will use appConfig.zshInitDir + 'init.zsh'
    const defaultShellInitPath = path.join(this.appConfig.zshInitDir, 'init.zsh');
    log('generateAll: Calling shellInitGenerator.generate...', shellInitOptions);
    await this.shellInitGenerator.generate(toolConfigs, shellInitOptions);
    // ShellInitGenerator writes to a known path, so we record that.
    // If it were to return the path, that would be more robust.
    currentManifest.generatedShellInitFile = defaultShellInitPath;
    log(
      `generateAll: Shell init generation complete. Recorded path: ${currentManifest.generatedShellInitFile}`
    );

    // 3. Generate Symlinks
    const symlinkOptions: GenerateSymlinksOptions = { dryRun, overwrite: true, backup: true }; // Sensible defaults for orchestrator
    log('generateAll: Calling symlinkGenerator.generate...', symlinkOptions);
    await this.symlinkGenerator.generate(toolConfigs, symlinkOptions); // Returns void

    const symlinkManifestEntries: GeneratedArtifactsManifest['generatedSymlinks'] = [];
    for (const toolName of Object.keys(toolConfigs)) {
      const config = toolConfigs[toolName];
      if (config?.symlinks) {
        for (const symlink of config.symlinks) {
          // Resolve source path relative to dotfilesDir
          const absoluteSourcePath = path.resolve(this.appConfig.dotfilesDir, symlink.source);

          // Resolve target path (linkPath)
          // SymlinkGenerator resolves '~' to appConfig.targetDir (which should be user's home)
          // and relative paths from appConfig.targetDir.
          let absoluteLinkPath = symlink.target;
          if (symlink.target.startsWith('~/')) {
            absoluteLinkPath = path.resolve(this.appConfig.targetDir, symlink.target.substring(2));
          } else if (!path.isAbsolute(symlink.target)) {
            absoluteLinkPath = path.resolve(this.appConfig.targetDir, symlink.target);
          }

          // In dryRun, list all intended symlinks.
          // In non-dryRun, we assume symlinkGenerator handled source existence check.
          // For the manifest, we'll record it if it was declared.
          // A more robust solution would be for symlinkGenerator to return actual results.
          if (dryRun) {
            symlinkManifestEntries.push({
              sourcePath: symlink.source, // Store relative source path as in config
              linkPath: absoluteLinkPath, // Store resolved link path
            });
          } else {
            // For non-dry run, we can be more confident it was created if source exists
            // This is an approximation as symlinkGenerator returns void.
            if (await this.fs.exists(absoluteSourcePath)) {
              symlinkManifestEntries.push({
                sourcePath: symlink.source,
                linkPath: absoluteLinkPath,
              });
            } else {
              log(
                `generateAll: Symlink source ${absoluteSourcePath} for tool ${toolName} not found, not adding to manifest.`
              );
            }
          }
        }
      }
    }
    currentManifest.generatedSymlinks = symlinkManifestEntries;
    log(
      `generateAll: Symlink generation complete. ${currentManifest.generatedSymlinks.length} symlinks recorded/intended.`
    );

    // Update timestamp
    currentManifest.lastGenerationTimestamp = new Date().toISOString();

    if (dryRun) {
      log(
        `generateAll: [DRY RUN] Manifest update simulated. Content that would be written to ${manifestPath}:`
      );
      console.log(JSON.stringify(currentManifest, null, 2)); // Using console.log for dry run output as per spec
    } else {
      try {
        log(`generateAll: Writing updated manifest to ${manifestPath}`);
        const manifestDir = path.dirname(manifestPath);
        // Only ensureDir and writeFile if not in dryRun (already handled by the main if/else)
        // This block is only entered if not dryRun.
        await this.fs.ensureDir(manifestDir);
        await this.fs.writeFile(manifestPath, JSON.stringify(currentManifest, null, 2));
        log('generateAll: Manifest written successfully.');
      } catch (error) {
        log(
          `generateAll: Failed to write manifest to ${manifestPath}. Error: ${error instanceof Error ? error.message : String(error)}`
        );
        // Decide if this should throw or just log. For now, logging.
        // throw new Error(`Failed to write manifest: ${error}`);
      }
    }

    log('generateAll: Orchestration complete.');
    return currentManifest;
  }
}
