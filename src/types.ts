/**
 * @file src/types.ts
 * @description Project-wide shared type definitions for the dotfiles generator.
 *
 * ## Development Plan
 *
 * ### Mandatory Pre-read:
 * - `memory-bank/techContext.md` (TypeScript Configuration Structure (Detailed Requirements) section)
 * - `.clinerules` (for file structure, naming, and content guidelines)
 *
 * ### Tasks:
 * - [x] Define `InstallHookContext` interface.
 * - [x] Define `AsyncInstallHook` type.
 * - [x] Define `BaseInstallParams` interface.
 * - [x] Define `GithubReleaseInstallParams` interface.
 * - [x] Define `BrewInstallParams` interface.
 * - [x] Define `CurlScriptInstallParams` interface.
 * - [x] Define `CurlTarInstallParams` interface.
 * - [x] Define `PipInstallParams` interface.
 * - [x] Define `ManualInstallParams` interface.
 * - [x] Define `ToolConfigBuilder` interface.
 * - [x] Define `AsyncConfigureTool` type.
 * - [ ] (No dedicated tests needed for this file as it only contains type definitions - correctness verified by TSC and consuming code's tests, as per techContext.md and .clinerules)
 * - [ ] Cleanup all linting errors and warnings (after initial creation).
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

// Define context passed to TypeScript hooks
export interface InstallHookContext {
  toolName: string;
  installDir: string; // The directory where the tool's binary will be installed
  downloadPath?: string; // Path to the downloaded file/archive (available after download hook)
  extractDir?: string; // Path to the extracted contents (available after extract hook)
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
}

/**
 * The main function exported by each tool configuration file.
 * It receives a ToolConfigBuilder and defines the tool's configuration.
 * @param c The ToolConfigBuilder instance.
 */
export type AsyncConfigureTool = (c: ToolConfigBuilder) => Promise<void>;

// Additional types that might be useful from techContext.md or systemPatterns.md

/**
 * Represents a tool's complete configuration.
 * This will be built by the ToolConfigBuilder.
 */
export interface ToolConfig {
  name: string; // Name of the tool, derived from its config file name
  binaries: string[];
  version: string;
  installationMethod?: 'github-release' | 'brew' | 'curl-script' | 'curl-tar' | 'pip' | 'manual';
  installParams?: InstallParams; // Holds the specific params for the chosen method
  zshInit?: string;
  symlinks?: { source: string; target: string }[];
  archOverrides?: { [osArch: string]: Partial<Omit<ToolConfig, 'name' | 'archOverrides'>> }; // Simplified, direct overrides
  // Hooks are part of InstallParams
}

/**
 * Represents an entry in the manifest file.
 */
export interface ManifestEntry {
  toolName: string;
  shimPath: string;
  binaryPath?: string; // Actual path to the installed binary
  version?: string;
  installedOn?: string; // ISO date string
  configPath: string; // Path to the tool's TypeScript config file
}

/**
 * Represents the structure of the manifest file.
 */
export interface Manifest {
  [toolName: string]: ManifestEntry;
}

/**
 * Represents a GitHub Release asset.
 */
export interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  // Add other relevant fields if needed
}

/**
 * Represents a GitHub Release.
 */
export interface GitHubRelease {
  tag_name: string;
  assets: GitHubReleaseAsset[];
  // Add other relevant fields if needed
}

/**
 * Configuration for the application, loaded from .env and CLI args.
 */
export interface AppConfig {
  targetDir: string;
  dotfilesDir: string;
  generatedDir: string;
  toolConfigDir: string;
  debug: string;
  cacheEnabled: boolean;
  sudoPrompt?: string;
  // Derived paths
  cacheDir: string;
  binariesDir: string; // Dir for actual binaries: .generated/binaries/
  binDir: string; // Dir for symlinks: .generated/bin/
  zshInitDir: string;
  manifestPath: string;
}

/**
 * System information for architecture detection.
 * Used as input to getArchitectureRegex for testability via DI.
 */
export interface SystemInfo {
  platform: string; // os.platform() result
  arch: string; // os.arch() result
  release?: string; // os.release() result (optional)
}

/**
 * Architecture patterns for matching GitHub release assets.
 * Contains regex patterns that match common naming conventions.
 */
export interface ArchitecturePatterns {
  system: string[]; // OS patterns like ['apple', 'darwin', 'macos']
  cpu: string[]; // Architecture patterns like ['arm64', 'aarch64']
  variants: string[]; // Additional OS-specific patterns
}

/**
 * Result of architecture detection with regex patterns.
 */
export interface ArchitectureRegex {
  systemPattern: string; // Combined regex pattern for OS matching
  cpuPattern: string; // Combined regex pattern for CPU architecture
  variantPattern: string; // Combined regex pattern for OS variants
}
