export interface IBinaryConfig {
  name: string;
  pattern: string;
}

export interface IFileState {
  filePath: string;
  toolName: string;
  fileType: "shim" | "binary" | "symlink" | "copy" | "config" | "completion" | "init" | "hook-generated" | "catalog";
}

/**
 * Standard API response wrapper for all dashboard endpoints.
 */
export interface IApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Serializable binary configuration for API response.
 */
export type SerializableBinary = string | IBinaryConfig;

/**
 * Serializable install params - common fields across all methods.
 * Method-specific fields are included as optional for flexibility.
 */
export interface ISerializableInstallParams {
  /** GitHub repository (github-release, zsh-plugin) */
  repo?: string;
  /** Use GitHub CLI for downloads (github-release) */
  ghCli?: boolean;
  /** Crate name (cargo) */
  crate?: string;
  /** Homebrew formula or cask name (brew) */
  formula?: string;
  /** URL (curl-script, curl-tar) */
  url?: string;
}

/**
 * JSON-serializable tool configuration from .tool.ts files.
 * Contains static configuration, not runtime state.
 */
export interface ISerializableToolConfig {
  name: string;
  version: string;
  installationMethod: string;
  installParams?: ISerializableInstallParams;
  binaries?: SerializableBinary[];
  dependencies?: string[];
  hostname?: string;
}

/**
 * Runtime status for a tool.
 */
export type ToolRuntimeStatus = "installed" | "not-installed" | "error";

/**
 * Runtime state from the installation registry.
 */
export interface IToolRuntimeState {
  status: ToolRuntimeStatus;
  installedVersion: string | null;
  installedAt: string | null;
  installPath: string | null;
  binaryPaths: string[];
  hasUpdate: boolean;
}

/**
 * Complete tool detail combining static config and runtime state.
 */
export interface IToolDetail {
  /** Static configuration from .tool.ts */
  config: ISerializableToolConfig;
  /** Runtime state from registry */
  runtime: IToolRuntimeState;
  /** Files tracked by the file registry */
  files: IFileState[];
  /** Binary disk size in bytes for this tool */
  binaryDiskSize: number;
  /** Usage statistics gathered from shim executions */
  usage: IToolUsageSummary;
}

/**
 * Per-binary usage stats for a tool.
 */
export interface IToolBinaryUsage {
  binaryName: string;
  count: number;
  lastUsedAt: string | null;
}

/**
 * Usage summary for a tool.
 */
export interface IToolUsageSummary {
  totalCount: number;
  binaries: IToolBinaryUsage[];
}

/**
 * Tool summary for catalog listing (subset of detail).
 */
export interface IToolSummary {
  name: string;
  version: string;
  installationMethod: string;
  status: ToolRuntimeStatus;
  installedVersion: string | null;
  hasUpdate: boolean;
  binaries?: SerializableBinary[];
}

/**
 * File tree entry for displaying tool config directory structure.
 */
export interface IFileTreeEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: IFileTreeEntry[];
  /** For tool files, the associated tool name */
  toolName?: string;
}

/**
 * One configured tool-configs directory and the tool files found under it.
 */
export interface IToolConfigsRoot {
  /** Absolute directory path with the home directory contracted to `~`. */
  label: string;
  path: string;
  entries: IFileTreeEntry[];
}

/**
 * Tool configs file tree response, grouped by configured tool-configs directory.
 */
export interface IToolConfigsTree {
  roots: IToolConfigsRoot[];
}

/**
 * Health check result for a single check.
 */
export interface IHealthCheckResult {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  details?: string[];
}

/**
 * Overall health status.
 */
export interface IHealthStatus {
  overall: "healthy" | "warning" | "unhealthy";
  checks: IHealthCheckResult[];
  lastCheck: string;
}

/**
 * Path configuration value which may be a single path string or an array of path strings.
 */
export type ConfigPathValue = string | string[] | undefined;

/**
 * Project configuration summary for settings display.
 */
export interface IConfigSummary {
  dotfilesDir: string;
  generatedDir: string;
  binariesDir: string;
  targetDir: string;
  toolConfigsDir: string | string[];
}

/**
 * Single file entry for the files list.
 */
export interface IFileEntry {
  filePath: string;
  fileType: string;
  toolName: string;
}

/**
 * Files list response (flat list, UI builds tree).
 */
export interface IFilesList {
  files: IFileEntry[];
  totalCount: number;
}

/**
 * File tree node for UI display.
 */
export interface IFileTreeNode {
  name: string;
  path: string;
  type: "directory" | "file";
  fileType?: string;
  toolName?: string;
  children?: IFileTreeNode[];
}

/**
 * Tool history entry for timeline display.
 */
export interface IToolHistoryEntry {
  id: number;
  operationType: string;
  fileType: string;
  filePath: string;
  relativeTime: string;
}

/**
 * Tool history response.
 */
export interface IToolHistory {
  entries: IToolHistoryEntry[];
  totalCount: number;
  installedAt: string | null;
  dotfilesDir: string;
}

/**
 * Timestamp source for recent tools.
 */
export type TimestampSource = "git" | "mtime";

/**
 * Recently added tool file entry.
 */
export interface IRecentToolFile {
  name: string;
  configFilePath: string;
  relativeTime: string;
  timestampSource: TimestampSource;
}

/**
 * Recently added tools response.
 */
export interface IRecentTools {
  tools: IRecentToolFile[];
}

/**
 * Tool source payload shared by server routes and client components.
 */
export interface IToolSourcePayload {
  content: string;
  filePath: string;
}

/**
 * Tool README payload shared by server routes and client components.
 */
export interface IToolReadmePayload {
  content: string;
}

/**
 * Request body for POST /api/tools/:name/install
 */
export interface IInstallToolRequest {
  /** Whether to force reinstallation even if already installed */
  force?: boolean;
}

/**
 * Response for POST /api/tools/:name/install
 */
export interface IInstallToolResponse {
  /** Whether the installation was successful */
  installed: boolean;
  /** Installed version (when successful) */
  version?: string;
  /** Whether the tool was already installed (skipped) */
  alreadyInstalled?: boolean;
  /** Error message (when failed) */
  error?: string;
}

/**
 * Response for POST /api/tools/:name/check-update
 */
export interface ICheckUpdateResponse {
  /** Whether an update is available */
  hasUpdate: boolean;
  /** Currently configured or installed version */
  currentVersion: string;
  /** Latest available version */
  latestVersion: string;
  /** Error message when check fails */
  error?: string;
}

/**
 * Response for POST /api/tools/:name/update
 */
export interface IUpdateToolResponse {
  /** Whether the update was successful */
  updated: boolean;
  /** The old version before update */
  oldVersion?: string;
  /** The new version after update */
  newVersion?: string;
  /** Error message when update fails */
  error?: string;
}
