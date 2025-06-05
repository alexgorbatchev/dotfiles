/**
 * @file generator/src/modules/generator-shell-init/IShellInitGenerator.ts
 * @description Interface for the shell initialization file generator.
 *
 * ## Development Plan (for IShellInitGenerator.ts)
 *
 * ### Tasks:
 * - [x] Define `GenerateShellInitOptions` interface.
 * - [x] Define `IShellInitGenerator` interface with the `generate` method.
 * - [x] Add JSDoc comments for all interfaces and methods.
 * - [x] (No dedicated tests needed for this file as it only contains type definitions - correctness verified by TSC and consuming code's tests)
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Update the memory bank with the new information when all tasks are complete (part of the overall module task).
 */

import type { AppConfig, ToolConfig } from '../../types';
import type { IFileSystem } from '../file-system';

/**
 * Options for generating the shell initialization file.
 */
export interface GenerateShellInitOptions {
  /**
   * If true, logs actions and content instead of writing the file.
   * @default false
   */
  dryRun?: boolean;

  /**
   * Optional path to write the generated init file.
   * If not provided, a default path will be derived from AppConfig.
   */
  outputPath?: string;
}

/**
 * Interface for a service that generates a consolidated shell initialization file.
 */
export interface IShellInitGenerator {
  /**
   * Generates the shell initialization file based on the provided tool configurations.
   *
   * @param toolConfigs - A record of tool configurations, where keys are tool names.
   * @param options - Optional parameters for generation, like dry-run.
   * @returns A promise that resolves when the generation is complete.
   * @throws Error if generation fails (e.g., due to file system issues, unless in dryRun mode).
   */
  generate(
    toolConfigs: Record<string, ToolConfig>,
    options?: GenerateShellInitOptions
  ): Promise<void>;
}

/**
 * Constructor signature for classes implementing IShellInitGenerator.
 * This allows for dependency injection of IFileSystem and AppConfig.
 */
export interface IShellInitGeneratorConstructor {
  new (fileSystem: IFileSystem, appConfig: AppConfig): IShellInitGenerator;
}
