import type { ToolConfig } from '@dotfiles/schemas';
import type {
  BrewInstallMetadata,
  BrewInstallResult,
  BrewInstallSuccess,
  CargoInstallMetadata,
  CargoInstallResult,
  CargoInstallSuccess,
  CurlScriptInstallMetadata,
  CurlScriptInstallResult,
  CurlTarInstallMetadata,
  CurlTarInstallResult,
  GitHubReleaseInstallMetadata,
  GitHubReleaseInstallResult,
  GitHubReleaseInstallSuccess,
  ManualInstallMetadata,
  ManualInstallResult,
} from './installers';

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
