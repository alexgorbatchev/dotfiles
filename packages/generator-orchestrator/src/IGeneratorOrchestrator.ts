import type { ToolConfig } from '@dotfiles/schemas';

/**
 * Options for the `generateAll` method of the `IGeneratorOrchestrator`.
 */
export type GenerateAllOptions = Record<string, never>;

/**
 * Interface for the Generator Orchestrator.
 * This module is responsible for coordinating the generation of all artifacts,
 * including shims, shell initialization scripts, and symlinks.
 */
export interface IGeneratorOrchestrator {
  /**
   * Triggers the generation of all artifacts based on the provided tool configurations.
   * This includes:
   * 1. Calling the `IShimGenerator` to create shims.
   * 2. Calling the `IShellInitGenerator` to create or update shell initialization scripts.
   * 3. Calling the `ISymlinkGenerator` to create symlinks.
   *
   * All file operations are tracked in the registry database for cleanup and audit purposes.
   *
   * @param toolConfigs A record of tool configurations, where the key is the tool name.
   * @param options Optional parameters for the generation process.
   * @returns A promise that resolves when all operations are complete.
   */
  generateAll(toolConfigs: Record<string, ToolConfig>, options?: GenerateAllOptions): Promise<void>;
}
