// Import aggregated plugin types from plugin system
import type { AggregateInstallResult, ToolConfig } from '@dotfiles/core';

/**
 * Options for the install operation
 */
export interface IInstallOptions {
  /**
   * Whether to force installation even if the tool is already installed
   */
  force?: boolean;

  /**
   * Whether to show verbose output during installation
   */
  verbose?: boolean;

  /**
   * Whether to suppress progress indicators and non-essential output
   */
  quiet?: boolean;

  /**
   * Whether running in shim mode - suppresses log messages but keeps progress bars
   */
  shimMode?: boolean;

  /**
   * Skip the "already installed" version check and always run the plugin.
   * Used for auto-install to ensure plugins can return shellInit even when
   * already installed (the plugin decides whether to do actual work).
   */
  skipVersionCheck?: boolean;
}

/**
 * Union of all possible installation results - automatically composed from registered plugins
 */
export type InstallResult = AggregateInstallResult;

/**
 * Interface for the tool installer
 */
export interface IInstaller {
  /**
   * Install a tool based on its configuration
   *
   * @param toolName The name of the tool to install
   * @param toolConfig The tool configuration
   * @param options Installation options
   * @returns Promise resolving to the installation result
   */
  install(toolName: string, toolConfig: ToolConfig, options?: IInstallOptions): Promise<InstallResult>;
}
