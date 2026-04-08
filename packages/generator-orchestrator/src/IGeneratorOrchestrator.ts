import type { InstallResultSuccess, IPluginShellInit, ShellType, ToolConfig } from "@dotfiles/core";

/**
 * Result type for auto-install operations.
 */
export interface IAutoInstallResult {
  /** The name of the tool that was installed */
  toolName: string;
  /** Whether the installation was successful */
  success: boolean;
  /** Shell initialization data emitted by the installer (only on success) */
  shellInit?: Partial<Record<ShellType, IPluginShellInit>>;
}

/**
 * Interface for the installer used during auto-install operations.
 * This is a minimal interface to avoid circular dependencies.
 */
export interface IAutoInstaller {
  /**
   * Install a tool based on its configuration.
   */
  install(toolName: string, toolConfig: ToolConfig): Promise<InstallResultSuccess | { success: false }>;
}

/**
 * Options for the generateAll operation.
 */
export interface IGenerateAllOptions {
  /**
   * If true, overwrite conflicting files that were not created by the generator.
   * @default false
   */
  overwrite?: boolean;

  /**
   * Optional installer to use for auto-install operations.
   * When provided, tools with `auto: true` in their install params will be
   * automatically installed before shell init generation.
   */
  installer?: IAutoInstaller;
}

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
   * @param options Optional settings for the generation process.
   * @returns A promise that resolves when all operations are complete.
   */
  generateAll(toolConfigs: Record<string, ToolConfig>, options?: IGenerateAllOptions): Promise<void>;

  /**
   * Generates shell completion files for a specific tool after installation.
   * This should be called after a tool has been successfully installed.
   *
   * @param toolName - The name of the tool to generate completions for.
   * @param toolConfig - The tool configuration containing completion settings.
   * @param version - Optional version of the installed tool for URL/source interpolation.
   * @param binaryPaths - Optional paths to installed binaries (used for PATH prepending during completion command execution).
   * @returns A promise that resolves when completion generation is complete.
   */
  generateCompletionsForTool(
    toolName: string,
    toolConfig: ToolConfig,
    version?: string,
    binaryPaths?: string[],
  ): Promise<void>;

  /**
   * Cleans up generated artifacts for a tool.
   *
   * This removes shims, symlinks, and completions that were generated for the tool,
   * while preserving downloaded binaries. Used when a tool is disabled or when
   * removing a tool from the system.
   *
   * @param toolName - The name of the tool to clean up.
   * @returns A promise that resolves when cleanup is complete.
   */
  cleanupToolArtifacts(toolName: string): Promise<void>;
}
