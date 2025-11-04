import type { ToolConfig } from '@dotfiles/schemas';

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
 * Success result for Homebrew installations
 */
export interface BrewInstallSuccess extends OperationSuccess {
  binaryPaths: string[];
  version?: string;
  metadata: BrewInstallMetadata;
}

/**
 * Result type for Brew installations
 */
export type BrewInstallResult = BrewInstallSuccess | OperationFailure;

/**
 * Success result for GitHub Release installations
 */
export interface GitHubReleaseInstallSuccess extends OperationSuccess {
  binaryPaths: string[];
  version: string;
  originalTag: string;
  metadata: GitHubReleaseInstallMetadata;
}

/**
 * Result type for GitHub Release installations
 */
export type GitHubReleaseInstallResult = GitHubReleaseInstallSuccess | OperationFailure;

/**
 * Success result for Manual installations
 */
export interface ManualInstallSuccess extends OperationSuccess {
  binaryPaths: string[];
  metadata: ManualInstallMetadata;
}

/**
 * Result type for Manual installations
 */
export type ManualInstallResult = ManualInstallSuccess | OperationFailure;

/**
 * Success result for Curl Script installations
 */
export interface CurlScriptInstallSuccess extends OperationSuccess {
  binaryPaths: string[];
  metadata: CurlScriptInstallMetadata;
}

/**
 * Result type for Curl Script installations
 */
export type CurlScriptInstallResult = CurlScriptInstallSuccess | OperationFailure;

/**
 * Success result for Curl Tar installations
 */
export interface CurlTarInstallSuccess extends OperationSuccess {
  binaryPaths: string[];
  metadata: CurlTarInstallMetadata;
}

/**
 * Result type for Curl Tar installations
 */
export type CurlTarInstallResult = CurlTarInstallSuccess | OperationFailure;

/**
 * Success result for Cargo installations
 */
export interface CargoInstallSuccess extends OperationSuccess {
  binaryPaths: string[];
  version: string;
  originalTag?: string;
  metadata: CargoInstallMetadata;
}

/**
 * Result type for Cargo installations
 */
export type CargoInstallResult = CargoInstallSuccess | OperationFailure;

/**
 * Union of all possible installation results
 */
export type InstallResult =
  | BrewInstallResult
  | GitHubReleaseInstallResult
  | ManualInstallResult
  | CurlScriptInstallResult
  | CurlTarInstallResult
  | CargoInstallResult;

/**
 * Type guard to check if result has a defined version property
 */
export function hasVersion(
  result: InstallResult
): result is (BrewInstallSuccess & { version: string }) | GitHubReleaseInstallSuccess | CargoInstallSuccess {
  return result.success && 'version' in result && result.version !== undefined;
}

/**
 * Type guard to check if result has originalTag property
 */
export function hasOriginalTag(result: InstallResult): result is GitHubReleaseInstallSuccess | CargoInstallSuccess {
  return result.success && 'originalTag' in result;
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
