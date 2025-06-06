/**
 * @file Defines the interface for the Shim Generator module.
 *
 * ## Development Plan
 *
 * - [x] Define `GenerateShimsOptions` interface.
 * - [x] Define `IShimGenerator` interface.
 *   - [x] Add `generate` method.
 *   - [x] Add `generateForTool` method.
 *   - [x] Update `generate` and `generateForTool` return types to `Promise<string[]>`.
 * - [ ] Write tests for the module (covered in ShimGenerator.test.ts).
 * - [x] Refactor dry run mechanism: Remove `dryRun` from `GenerateShimsOptions`.
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Ensure 100% test coverage for executable code.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import type { ToolConfig } from '../../types'; // Removed AppConfig as it's not used here

/**
 * Options for generating shims.
 */
export interface GenerateShimsOptions {
  /**
   * If true, overwrite existing shims.
   * @default false
   */
  overwrite?: boolean;
}

/**
 * Interface for a service that generates shims for tools.
 */
export interface IShimGenerator {
  /**
   * Generates shims for all provided tool configurations.
   * @param toolConfigs A record of tool configurations, keyed by tool name.
   * @param options Optional settings for shim generation.
   * @returns A promise that resolves with an array of paths to the shims created/updated.
   */
  generate(
    toolConfigs: Record<string, ToolConfig>,
    options?: GenerateShimsOptions
  ): Promise<string[]>;

  /**
   * Generates a shim for a single specified tool.
   * @param toolName The name of the tool.
   * @param toolConfig The configuration for the tool.
   * @param options Optional settings for shim generation.
   * @returns A promise that resolves with an array of paths to the shims created/updated (typically one).
   */
  generateForTool(
    toolName: string,
    toolConfig: ToolConfig,
    options?: GenerateShimsOptions
  ): Promise<string[]>;
}
