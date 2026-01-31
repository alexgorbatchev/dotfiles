import type { IPluginShellInit, ISystemInfo, ShellType, ToolConfig } from '@dotfiles/core';
import type { IProfileUpdateResult } from './profile-updater/IProfileUpdater';

/**
 * Plugin-emitted shell initialization content, keyed by tool name and shell type.
 */
export type PluginShellInitMap = Record<string, Partial<Record<ShellType, IPluginShellInit>>>;

/**
 * Options for generating shell initialization files.
 */
export interface IGenerateShellInitOptions {
  /**
   * Optional path to write the generated init file.
   * If not provided, a default path will be derived from ProjectConfig.
   */
  outputPath?: string;

  /**
   * Shell types to generate initialization files for.
   * If not provided, defaults to ['zsh'] for backward compatibility.
   */
  shellTypes?: ShellType[];

  /**
   * Whether to update shell profile files to source the generated scripts.
   * Defaults to true.
   */
  updateProfileFiles?: boolean;

  /**
   * System information for platform-aware shell generation.
   * When provided, platform-specific configurations matching this system will be included.
   */
  systemInfo?: ISystemInfo;

  /**
   * Plugin-emitted shell initialization content.
   * Keyed by tool name, then by shell type.
   * This content is merged with user-defined shell configuration from tool configs.
   */
  pluginShellInit?: PluginShellInitMap;
}

/**
 * Results from generating shell initialization files.
 */
export interface IShellInitGenerationResult {
  /** Map of shell type to generated file path */
  files: Map<ShellType, string>;
  /** Primary shell initialization file path (for backward compatibility) */
  primaryPath: string | null;
  /** Results from profile file updates, if requested */
  profileUpdates?: IProfileUpdateResult[];
}

/**
 * Interface for a service that generates shell initialization files for multiple shells.
 */
export interface IShellInitGenerator {
  /**
   * Generates shell initialization files based on the provided tool configurations.
   *
   * @param toolConfigs - A record of tool configurations, where keys are tool names.
   * @param options - Optional parameters for generation, including shell types to generate.
   * @returns A promise that resolves with the generation results, or `null` if not generated.
   * @throws Error if generation fails (e.g., due to file system issues).
   */
  generate(
    toolConfigs: Record<string, ToolConfig>,
    options?: IGenerateShellInitOptions,
  ): Promise<IShellInitGenerationResult | null>;
}
