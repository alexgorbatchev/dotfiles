// Import aggregated plugin types from plugin system
import type { AggregateInstallResult, ToolConfig } from '@dotfiles/core';

/**
 * Standard success result for operations.
 */
export interface OperationSuccess {
  success: true;
}

/**
 * Standard failure result for operations.
 * When an operation fails, it MUST provide an error explaining why.
 */
export interface OperationFailure {
  success: false;
  error: string;
}

/**
 * Options for the install operation
 */
export interface InstallOptions {
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
  install(toolName: string, toolConfig: ToolConfig, options?: InstallOptions): Promise<InstallResult>;
}
