import type { ToolConfig } from '@types';

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
 * Result of the install operation
 */
export interface InstallResult {
  /**
   * Whether the installation was successful
   */
  success: boolean;

  /**
   * All binary paths for the installed tool
   */
  binaryPaths?: string[];

  /**
   * The installation path (timestamped directory)
   */
  installPath?: string;

  /**
   * The version of the installed tool
   */
  version?: string;

  /**
   * Error message if installation failed
   */
  error?: string;

  /**
   * Success message for the installation
   */
  message?: string;

  /**
   * Additional information about the installation
   */
  info?: Record<string, unknown>;
}

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
