/**
 * @file generator/src/types/toolConfig.types.ts
 * @description Types related to tool configuration.
 *
 * ## Development Plan
 *
 * ### Tasks
 * - [x] Define types for tool configuration.
 * - [ ] Add JSDoc comments to all types and properties.
 * - [ ] Ensure all necessary imports are present.
 * - [ ] Ensure all types are exported.
 * - [ ] (No dedicated tests needed for this file as it only contains type definitions - correctness verified by TSC and consuming code's tests, as per techContext.md and .roorules)
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import type { ExtractResult } from './archive.types';
import type { SystemInfo } from './common.types';
import type { CompletionConfig } from './completion.types';
import type { GitHubReleaseAsset } from './githubApi.types';

// ============================================
// Tool Configuration Types
// ============================================

// Define context passed to TypeScript hooks
export interface InstallHookContext {
  toolName: string;
  installDir: string; // The directory where the tool's binary will be installed
  downloadPath?: string; // Path to the downloaded file/archive (available after download hook)
  extractDir?: string; // Path to the extracted contents (available after extract hook)
  extractResult?: ExtractResult; // NEW: Result of extraction with executables list
  systemInfo?: SystemInfo; // NEW: System information for hooks
  // Use google/zx for running commands and file system operations within hooks
}

// Define the type for asynchronous TypeScript hook functions
export type AsyncInstallHook = (context: InstallHookContext) => Promise<void>;

// Base interface for installation parameters, includes common hook properties
export interface BaseInstallParams {
  /**
   * Environment variables to set specifically for the installation process.
   * These are set by the generator's install-tool command before running
   * the installation command and hooks.
   */
  env?: { [key: string]: string };

  hooks?: {
    beforeInstall?: AsyncInstallHook; // Runs before any installation steps
    afterDownload?: AsyncInstallHook; // Runs after the tool's archive/script is downloaded
    afterExtract?: AsyncInstallHook; // Runs after the archive is extracted (for archive-based methods)
    afterInstall?: AsyncInstallHook; // Runs after the main installation command completes
  };
}

// Specific interfaces for installParams for each method, extending BaseInstallParams
export interface GithubReleaseInstallParams extends BaseInstallParams {
  repo: string; // GitHub repository in "owner/repo" format
  assetPattern?: string; // Pattern to match the release asset filename (corresponds to Zinit's bpick)
  binaryPath?: string; // Path to the executable within the extracted archive (corresponds to Zinit's pick)
  moveBinaryTo?: string; // Path/name to move the extracted binary to (corresponds to Zinit's mv)
  version?: string; // NEW: Specific version or constraint
  includePrerelease?: boolean; // NEW: Whether to include pre-releases
  assetSelector?: (
    assets: GitHubReleaseAsset[],
    systemInfo: SystemInfo
  ) => GitHubReleaseAsset | undefined; // NEW: Custom asset selection function
  stripComponents?: number; // NEW: Number of leading components to strip from paths during extraction
  // atclone is replaced by hooks.afterDownload or hooks.afterExtract
}

export interface BrewInstallParams extends BaseInstallParams {
  formula?: string; // Homebrew formula name
  cask?: boolean; // True if it's a cask
  tap?: string | string[]; // Homebrew tap(s) required
}

export interface CurlScriptInstallParams extends BaseInstallParams {
  url: string; // URL of the installation script
  shell: 'bash' | 'sh'; // Shell to execute the script with
}

export interface CurlTarInstallParams extends BaseInstallParams {
  url: string; // URL of the tarball
  extractPath?: string; // Path within the tarball to extract (e.g., 'bin/tool')
  moveBinaryTo?: string; // Path/name to move the extracted file to
  stripComponents?: number; // NEW: Number of leading components to strip from paths during extraction
}

export interface PipInstallParams extends BaseInstallParams {
  packageName: string; // Name of the package to install via pip
}

export interface ManualInstallParams extends BaseInstallParams {
  binaryPath: string; // Expected path to the binary if not installed by the tool
}

// Union type for all possible installation parameters
export type InstallParams =
  | GithubReleaseInstallParams
  | BrewInstallParams
  | CurlScriptInstallParams
  | CurlTarInstallParams
  | PipInstallParams
  | ManualInstallParams;

// Define the ToolConfigBuilder interface with camelCase methods
export interface ToolConfigBuilder {
  /**
   * Specifies the names of the binaries that should have shims generated.
   * @param names A single binary name or an array of names.
   */
  bin(names: string | string[]): this;

  /**
   * Specifies the desired version of the tool. Defaults to 'latest'.
   * @param version The version string (e.g., '1.0.0') or 'latest'.
   */
  version(version: string): this;

  /**
   * Configures how the tool is installed.
   * @param method The installation method.
   * @param params Parameters specific to the installation method, including optional hooks.
   */
  install(method: 'github-release', params: GithubReleaseInstallParams): this;
  install(method: 'brew', params: BrewInstallParams): this;
  install(method: 'curl-script', params: CurlScriptInstallParams): this;
  install(method: 'curl-tar', params: CurlTarInstallParams): this;
  install(method: 'pip', params: PipInstallParams): this;
  install(method: 'manual', params: ManualInstallParams): this;

  /**
   * Defines asynchronous TypeScript hook functions to run during the installation lifecycle.
   * @param hooks An object containing optional hook functions for different stages.
   */
  hooks(hooks: {
    beforeInstall?: AsyncInstallHook;
    afterDownload?: AsyncInstallHook;
    afterExtract?: AsyncInstallHook;
    afterInstall?: AsyncInstallHook;
  }): this;

  /**
   * Adds raw Zsh code to the generated 02-config-generated/init.zsh file.
   * Use this for aliases, functions, env vars, path additions, sourcing, etc.
   * @param code A string containing valid Zsh script.
   */
  zsh(code: string): this;

  /**
   * Configures a symbolic link from a source path in the dotfiles repo to a target path in the home directory.
   * @param source The path relative to the dotfiles repository.
   * @param target The target path relative to the user's home directory.
   */
  symlink(source: string, target: string): this;

  /**
   * Defines configuration overrides for specific operating system and architecture combinations.
   * @param osArch The OS-architecture string (e.g., 'darwin-aarch64', 'linux-x86_64'). Use $(uname -s)-$(uname -m) format.
   * @param configureOverrides A callback function that receives a new ToolConfigBuilder to define the overrides.
   */
  arch(osArch: string, configureOverrides: (c: ToolConfigBuilder) => void): this;

  /**
   * Configures shell completions for the tool.
   * @param config An object containing completion configuration for different shells.
   */
  completions(config: CompletionConfig): this;
}

/**
 * The main function exported by each tool configuration file.
 * It receives a ToolConfigBuilder and defines the tool's configuration.
 * @param c The ToolConfigBuilder instance.
 */
export type AsyncConfigureTool = (c: ToolConfigBuilder) => Promise<void>;

// Common properties for all ToolConfig variants
interface BaseToolConfigProperties {
  name: string;
  binaries?: string[]; // Make binaries optional at the base level
  version: string;
  zshInit?: string[];
  symlinks?: { source: string; target: string }[];
  // Arch overrides can change the installation method, so the type needs to allow any valid ToolConfig structure,
  // minus the 'name' (which is fixed) and 'archOverrides' (to prevent nesting).
  // Note: ToolConfig will be a union type, this Omit should work across the union.
  archOverrides?: { [osArch: string]: Partial<Omit<ToolConfig, 'name' | 'archOverrides'>> };
  completions?: CompletionConfig;
  updateCheck?: {
    enabled?: boolean;
    constraint?: string;
  };
}

// Specific ToolConfig types based on installationMethod
export type GithubReleaseToolConfig = BaseToolConfigProperties & {
  installationMethod: 'github-release';
  installParams: GithubReleaseInstallParams;
  binaries: string[]; // Non-optional for this type
};

export type BrewToolConfig = BaseToolConfigProperties & {
  installationMethod: 'brew';
  installParams: BrewInstallParams;
  binaries: string[]; // Non-optional for this type
};

export type CurlScriptToolConfig = BaseToolConfigProperties & {
  installationMethod: 'curl-script';
  installParams: CurlScriptInstallParams;
  binaries: string[]; // Non-optional for this type
};

export type CurlTarToolConfig = BaseToolConfigProperties & {
  installationMethod: 'curl-tar';
  installParams: CurlTarInstallParams;
  binaries: string[]; // Non-optional for this type
};

export type PipToolConfig = BaseToolConfigProperties & {
  installationMethod: 'pip';
  installParams: PipInstallParams;
  binaries: string[]; // Non-optional for this type
};

export type ManualToolConfig = BaseToolConfigProperties & {
  installationMethod: 'manual';
  installParams: ManualInstallParams;
  binaries: string[]; // Non-optional for this type
};

// For tools that might not have an installation method (e.g., only zshInit or symlinks)
// or if installation is optional and handled by archOverrides.
// Binaries are optional here, inherited from BaseToolConfigProperties.
export type NoInstallToolConfig = BaseToolConfigProperties & {
  installationMethod: 'none'; // Use 'none' as an explicit discriminant value
  installParams?: undefined; // Explicitly undefined or absent
};

/**
 * Represents a tool's complete configuration.
 * This is a discriminated union based on `installationMethod`.
 * This will be built by the ToolConfigBuilder.
 */
export type ToolConfig =
  | GithubReleaseToolConfig
  | BrewToolConfig
  | CurlScriptToolConfig
  | CurlTarToolConfig
  | PipToolConfig
  | ManualToolConfig
  | NoInstallToolConfig;
