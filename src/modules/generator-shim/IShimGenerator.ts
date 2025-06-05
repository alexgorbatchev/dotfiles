/**
 * @file Defines the interface for the Shim Generator module.
 *
 * ## Development Plan
 *
 * - [x] Define `GenerateShimsOptions` interface.
 * - [x] Define `IShimGenerator` interface.
 *   - [x] Add `generate` method.
 *   - [x] Add `generateForTool` method.
 * - [ ] Write tests for the module (covered in ShimGenerator.test.ts).
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
   * If true, perform a dry run without writing files or making changes.
   * @default false
   */
  dryRun?: boolean;

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
   * @returns A promise that resolves when all shims have been generated.
   */
  generate(toolConfigs: Record<string, ToolConfig>, options?: GenerateShimsOptions): Promise<void>;

  /**
   * Generates a shim for a single specified tool.
   * @param toolName The name of the tool.
   * @param toolConfig The configuration for the tool.
   * @param options Optional settings for shim generation.
   * @returns A promise that resolves when the shim has been generated.
   */
  generateForTool(
    toolName: string,
    toolConfig: ToolConfig,
    options?: GenerateShimsOptions
  ): Promise<void>;
}
