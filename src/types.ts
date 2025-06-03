/**
 * @file src/types.ts
 * @description Project-wide shared type definitions for the dotfiles generator.
 *
 * ## Development Plan
 *
 * ### Mandatory Pre-read:
 * - `memory-bank/techContext.md` (TypeScript Configuration Structure (Detailed Requirements) section)
 * - `.clinerules` (for file structure, naming, and content guidelines)
 * - `memory-bank/zinit-analysis-consolidated.md` (for Zinit analysis findings)
 * - `memory-bank/types-summary.md` (for new type definitions)
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
 * - [x] Add download system types (DownloadProgress, DownloadOptions, DownloadStrategy, IDownloader).
 * - [x] Add archive extraction types (ArchiveFormat, ExtractOptions, ExtractResult, IArchiveExtractor).
 * - [x] Add completion management types (ShellType, ShellCompletionConfig, CompletionConfig, ICompletionInstaller).
 * - [x] Add version management types (UpdateInfo, VersionConstraint, IVersionChecker).
 * - [x] Enhance GitHub API types (GitHubRateLimit, GitHubReleaseAsset, GitHubRelease, IGitHubApiClient).
 * - [x] Update existing types (InstallHookContext, ToolConfig, ManifestEntry, AppConfig, GithubReleaseInstallParams).
 * - [ ] (No dedicated tests needed for this file as it only contains type definitions - correctness verified by TSC and consuming code's tests, as per techContext.md and .clinerules)
 * - [ ] Cleanup all linting errors and warnings (after initial creation).
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

// ============================================
// Download System Types
// ============================================

/**
 * Progress information for downloads
 */
export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes?: number;
  percentage?: number;
  speed?: number; // bytes per second
}

/**
 * Options for downloading files
 */
export interface DownloadOptions {
  headers?: Record<string, string>;
  timeout?: number; // milliseconds
  retryCount?: number;
  retryDelay?: number; // milliseconds
  onProgress?: (progress: DownloadProgress) => void;
}

/**
 * Strategy interface for swappable download implementations
 */
export interface DownloadStrategy {
  name: string;
  isAvailable(): Promise<boolean>;
  download(url: string, options: DownloadOptions): Promise<Buffer>;
}

/**
 * Interface for the download service
 */
export interface IDownloader {
  registerStrategy(strategy: DownloadStrategy): void;
  download(url: string, options?: DownloadOptions): Promise<Buffer>;
  downloadToFile(url: string, filePath: string, options?: DownloadOptions): Promise<void>;
}

// ============================================
// Archive Extraction Types
// ============================================

/**
 * Supported archive formats
 */
export type ArchiveFormat =
  | 'auto' // Auto-detect based on file extension
  | 'tar' // Plain tar
  | 'tar.gz' // Gzipped tar
  | 'tar.bz2' // Bzip2 tar
  | 'tar.xz' // XZ tar
  | 'tar.lzma' // LZMA tar
  | 'zip' // ZIP archive
  | 'rar' // RAR archive
  | '7z' // 7-Zip archive
  | 'deb' // Debian package
  | 'rpm' // RPM package
  | 'dmg'; // macOS disk image

/**
 * Options for extracting archives
 */
export interface ExtractOptions {
  format?: ArchiveFormat;
  stripComponents?: number;
  targetDir?: string;
  preservePermissions?: boolean;
  detectExecutables?: boolean;
}

/**
 * Result of archive extraction
 */
export interface ExtractResult {
  extractedFiles: string[];
  executables: string[]; // Files that were made executable
  rootDir?: string; // Top-level directory if archive contained one
}

/**
 * Interface for the archive extraction service
 */
export interface IArchiveExtractor {
  extract(archivePath: string, options?: ExtractOptions): Promise<ExtractResult>;
  detectFormat(filePath: string): Promise<ArchiveFormat>;
  isSupported(format: ArchiveFormat): boolean;
}

// ============================================
// Completion Management Types
// ============================================

/**
 * Shell type for completions
 */
export type ShellType = 'zsh' | 'bash' | 'fish';

/**
 * Configuration for a single shell's completions
 */
export interface ShellCompletionConfig {
  source: string; // Path within the extracted archive
  name?: string; // Custom completion name (defaults to _toolName)
  targetDir?: string; // Custom target directory
}

/**
 * Completion configuration for a tool
 */
export interface CompletionConfig {
  zsh?: ShellCompletionConfig;
  bash?: ShellCompletionConfig;
  fish?: ShellCompletionConfig;
}

/**
 * Interface for the completion installer service
 */
export interface ICompletionInstaller {
  installCompletions(
    toolName: string,
    extractedDir: string,
    config: CompletionConfig
  ): Promise<void>;

  getInstalledCompletions(toolName: string): Promise<Record<ShellType, string | undefined>>;
  removeCompletions(toolName: string): Promise<void>;
}

// ============================================
// Version Management Types
// ============================================

/**
 * Information about available updates
 */
export interface UpdateInfo {
  toolName: string;
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseNotes?: string;
  downloadUrl?: string;
  publishedAt?: string; // ISO date string
}

/**
 * Version constraint operators
 */
export type VersionConstraintOperator = '=' | '>' | '>=' | '<' | '<=' | '~' | '^';

/**
 * Version constraint specification
 */
export interface VersionConstraint {
  operator: VersionConstraintOperator;
  version: string;
}

/**
 * Interface for the version checker service
 */
export interface IVersionChecker {
  checkForUpdate(tool: ToolConfig): Promise<UpdateInfo | null>;
  checkAllForUpdates(): Promise<UpdateInfo[]>;
  parseVersionConstraint(constraint: string): VersionConstraint[];
  satisfiesConstraint(version: string, constraint: string): boolean;
}

// ============================================
// GitHub API Types
// ============================================

/**
 * GitHub rate limit information
 */
export interface GitHubRateLimit {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp
}

/**
 * Enhanced GitHub Release Asset with additional metadata
 */
export interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
  state: 'uploaded' | 'open';
  download_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Enhanced GitHub Release with additional metadata
 */
export interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string;
  assets: GitHubReleaseAsset[];
  body?: string; // Release notes
  html_url: string;
}

/**
 * Interface for the GitHub API client
 */
export interface IGitHubApiClient {
  getLatestRelease(owner: string, repo: string): Promise<GitHubRelease>;
  getReleaseByTag(owner: string, repo: string, tag: string): Promise<GitHubRelease>;
  getAllReleases(
    owner: string,
    repo: string,
    options?: { perPage?: number; includePrerelease?: boolean }
  ): Promise<GitHubRelease[]>;
  getReleaseByConstraint(
    owner: string,
    repo: string,
    constraint: string
  ): Promise<GitHubRelease | null>;
  getRateLimit(): Promise<GitHubRateLimit>;
}

// ============================================
// Original Types (Updated)
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
  zshInit?: string[]; // Corrected type to string[]
  symlinks?: { source: string; target: string }[];
  archOverrides?: { [osArch: string]: Partial<Omit<ToolConfig, 'name' | 'archOverrides'>> }; // Simplified, direct overrides
  completions?: CompletionConfig; // NEW: Completion configuration
  updateCheck?: {
    // NEW: Update checking configuration
    enabled?: boolean;
    constraint?: string; // e.g., ">=1.0.0", "~1.2.0"
  };
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
  lastChecked?: string; // NEW: Last update check timestamp
  lastUpdated?: string; // NEW: Last actual update timestamp
  configPath: string; // Path to the tool's TypeScript config file
  completions?: {
    // NEW: Installed completion files
    [K in ShellType]?: string;
  };
}

/**
 * Represents the structure of the manifest file.
 */
export interface Manifest {
  [toolName: string]: ManifestEntry;
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
  completionsDir: string; // NEW: Base directory for completions

  // New configuration options
  githubToken?: string; // NEW: Optional GitHub token
  checkUpdatesOnRun?: boolean; // NEW: Check for updates automatically
  updateCheckInterval?: number; // NEW: Seconds between update checks
  downloadTimeout?: number; // NEW: Download timeout in milliseconds
  downloadRetryCount?: number; // NEW: Number of download retries
  downloadRetryDelay?: number; // NEW: Delay between retries in milliseconds
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
