/**
 * @file generator/src/modules/generator-orchestrator/IGeneratorOrchestrator.ts
 * @description Interface for the GeneratorOrchestrator module.
 *
 * ## Development Plan
 *
 * ### Tasks
 * - [x] Define `GenerateAllOptions` interface.
 * - [x] Define `IGeneratorOrchestrator` interface with `generateAll` method.
 * - [x] (No dedicated tests needed for this file as it only contains type definitions - correctness verified by TSC and consuming code's tests)
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [x] Refactor dry run mechanism: Remove `dryRun` from `GenerateAllOptions`.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import type { ToolConfig, GeneratedArtifactsManifest } from '../../types';

/**
 * Options for the `generateAll` method of the `IGeneratorOrchestrator`.
 */
export interface GenerateAllOptions {
  /**
   * Optional: Specific version of the generator tool, to be recorded in the manifest.
   */
  generatorVersion?: string;

  // Potentially, options to pass down to sub-generators can be added here
  // e.g., shimGeneratorOptions?: IShimGeneratorOptions;
  // shellInitGeneratorOptions?: IShellInitGeneratorOptions;
  // symlinkGeneratorOptions?: ISymlinkGeneratorOptions;
}

/**
 * Interface for the Generator Orchestrator.
 * This module is responsible for coordinating the generation of all artifacts,
 * including shims, shell initialization scripts, and symlinks. It also manages
 * a manifest file that records the generated artifacts.
 */
export interface IGeneratorOrchestrator {
  /**
   * Triggers the generation of all artifacts based on the provided tool configurations.
   * This includes:
   * 1. Reading an existing manifest file (if any).
   * 2. Calling the `IShimGenerator` to create shims.
   * 3. Calling the `IShellInitGenerator` to create or update shell initialization scripts.
   * 4. Calling the `ISymlinkGenerator` to create symlinks.
   * 5. Collecting information about all generated artifacts.
   * 6. Updating the manifest data structure.
   * 7. Writing the new/updated manifest back to the file system.
   *
   * @param toolConfigs A record of tool configurations, where the key is the tool name.
   * @param options Optional parameters for the generation process, such as `dryRun`.
   * @returns A promise that resolves with the generated artifacts manifest when all operations are complete.
   *          In `dryRun` mode, this manifest represents what *would have been* generated.
   */
  generateAll(
    toolConfigs: Record<string, ToolConfig>,
    options?: GenerateAllOptions
  ): Promise<GeneratedArtifactsManifest>;
}
