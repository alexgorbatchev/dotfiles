import type { ToolConfig } from '@dotfiles/core';

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
   * @returns A promise that resolves when all operations are complete.
   */
  generateAll(toolConfigs: Record<string, ToolConfig>): Promise<void>;

  /**
   * Generates shell completion files for a specific tool after installation.
   * This should be called after a tool has been successfully installed.
   *
   * @param toolName - The name of the tool to generate completions for.
   * @param toolConfig - The tool configuration containing completion settings.
   * @returns A promise that resolves when completion generation is complete.
   */
  generateCompletionsForTool(toolName: string, toolConfig: ToolConfig): Promise<void>;
}
