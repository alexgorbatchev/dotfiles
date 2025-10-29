import type { ToolConfig } from '@dotfiles/schemas';

/**
 * Metadata for Homebrew installations
 */
export interface BrewInstallMetadata {
  method: 'brew';
  formula: string;
  isCask: boolean;
  tap?: string | string[];
}

/**
 * Metadata for GitHub Release installations
 */
export interface GitHubReleaseInstallMetadata {
  method: 'github-release';
  releaseUrl: string;
  publishedAt: string;
  releaseName: string;
  downloadUrl: string;
  assetName: string;
}

/**
 * Metadata for Manual installations
 */
export interface ManualInstallMetadata {
  method: 'manual';
  manualInstall: boolean;
  originalPath: string | null;
}

/**
 * Metadata for Curl Script installations
 */
export interface CurlScriptInstallMetadata {
  method: 'curl-script';
  scriptUrl: string;
  shell: string;
}

/**
 * Metadata for Curl Tar installations
 */
export interface CurlTarInstallMetadata {
  method: 'curl-tar';
  tarballUrl: string;
}

/**
 * Metadata for Cargo installations
 */
export interface CargoInstallMetadata {
  method: 'cargo';
  crateName: string;
  binarySource: string;
  downloadUrl?: string;
}

/**
 * Discriminated union of all installation metadata types
 */
export type InstallMetadata =
  | BrewInstallMetadata
  | GitHubReleaseInstallMetadata
  | ManualInstallMetadata
  | CurlScriptInstallMetadata
  | CurlTarInstallMetadata
  | CargoInstallMetadata;

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
   * The original tag from the source (e.g., GitHub release tag before normalization)
   */
  originalTag?: string;

  /**
   * Error message if installation failed
   */
  error?: string;

  /**
   * Success message for the installation
   */
  message?: string;

  /**
   * Strongly typed metadata about the installation method and details
   */
  metadata?: InstallMetadata;
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
