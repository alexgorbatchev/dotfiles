import type { ToolConfig } from "@dotfiles/core";

/**
 * Options for generating shims.
 */
export interface IGenerateShimsOptions {
  /**
   * If true, overwrite existing shims that were created by the generator.
   * @default false
   */
  overwrite?: boolean;
  /**
   * If true, overwrite conflicting files that were NOT created by the generator.
   * This is a more aggressive option that should be used with caution.
   * @default false
   */
  overwriteConflicts?: boolean;
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
  generate(toolConfigs: Record<string, ToolConfig>, options?: IGenerateShimsOptions): Promise<string[]>;

  /**
   * Generates a shim for a single specified tool.
   * @param toolName The name of the tool.
   * @param toolConfig The configuration for the tool.
   * @param options Optional settings for shim generation.
   * @returns A promise that resolves with an array of paths to the shims created/updated (typically one).
   */
  generateForTool(toolName: string, toolConfig: ToolConfig, options?: IGenerateShimsOptions): Promise<string[]>;
}
