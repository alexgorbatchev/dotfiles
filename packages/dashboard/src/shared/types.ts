import type { IBinaryConfig, ISystemInfo, ToolConfig } from '@dotfiles/core';
import { Architecture, Platform } from '@dotfiles/core';
import type { IFileOperation, IFileState } from '@dotfiles/registry/file';
import type { IToolInstallationRecord } from '@dotfiles/registry/tool';

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
export type ISerializableBinary = string | IBinaryConfig;

/**
 * Serializable install params - common fields across all methods.
 * Method-specific fields are included as optional for flexibility.
 */
export interface ISerializableInstallParams {
  /** GitHub repository (github-release, zsh-plugin) */
  repo?: string;
  /** Asset pattern (github-release) */
  assetPattern?: string;
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
 * Serializable symlink configuration.
 */
export interface ISerializableSymlink {
  source: string;
  target: string;
}

/**
 * Serializable platform configuration entry.
 * Represents platform-specific overrides in a JSON-safe format.
 */
export interface ISerializablePlatformConfigEntry {
  /** Display names for target platforms (e.g., ["Linux", "macOS"]) */
  platforms: string[];
  /** Display names for target architectures (e.g., ["x86_64", "arm64"]) - undefined means all architectures */
  architectures?: string[];
  /** Platform-specific installation method override */
  installationMethod?: string;
  /** Platform-specific install params override */
  installParams?: ISerializableInstallParams;
  /** Platform-specific binaries override */
  binaries?: ISerializableBinary[];
  /** Platform-specific symlinks override */
  symlinks?: ISerializableSymlink[];
}

/**
 * JSON-serializable tool configuration from .tool.ts files.
 * Contains static configuration, not runtime state.
 */
export interface ISerializableToolConfig {
  name: string;
  version: string;
  installationMethod: string;
  installParams: ISerializableInstallParams;
  binaries?: ISerializableBinary[];
  dependencies?: string[];
  symlinks?: ISerializableSymlink[];
  disabled?: boolean;
  hostname?: string;
  configFilePath?: string;
  /** Platform-specific configuration overrides */
  platformConfigs?: ISerializablePlatformConfigEntry[];
}

/**
 * Runtime state from the installation registry.
 */
export interface IToolRuntimeState {
  status: 'installed' | 'not-installed' | 'error';
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
  status: 'installed' | 'not-installed' | 'error';
  installedVersion: string | null;
  hasUpdate: boolean;
  binaries?: ISerializableBinary[];
}

/**
 * File tree entry for displaying tool config directory structure.
 */
export interface IFileTreeEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: IFileTreeEntry[];
  /** For tool files, the associated tool name */
  toolName?: string;
}

/**
 * Tool configs file tree response.
 */
export interface IToolConfigsTree {
  rootPath: string;
  entries: IFileTreeEntry[];
}

/**
 * Dashboard statistics for overview page.
 */
export interface IDashboardStats {
  toolsInstalled: number;
  updatesAvailable: number;
  filesTracked: number;
  totalOperations: number;
  oldestOperation: string | null;
  newestOperation: string | null;
}

/**
 * Health check result for a single check.
 */
export interface IHealthCheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: string[];
}

/**
 * Overall health status.
 */
export interface IHealthStatus {
  overall: 'healthy' | 'warning' | 'unhealthy';
  checks: IHealthCheckResult[];
  lastCheck: string;
}

/**
 * File operation for timeline display.
 */
export interface IFileOperationDisplay extends IFileOperation {
  formattedTime: string;
}

/**
 * Project configuration summary for settings display.
 */
export interface IConfigSummary {
  dotfilesDir: string;
  generatedDir: string;
  binariesDir: string;
  targetDir: string;
  toolConfigsDir: string;
}

/**
 * Convert a Platform bitmask to an array of human-readable platform names.
 */
export function platformBitmaskToNames(platforms: Platform): string[] {
  const names: string[] = [];
  if (platforms & Platform.Linux) names.push('Linux');
  if (platforms & Platform.MacOS) names.push('macOS');
  if (platforms & Platform.Windows) names.push('Windows');
  return names;
}

/**
 * Convert an Architecture bitmask to an array of human-readable architecture names.
 */
export function architectureBitmaskToNames(architectures: Architecture): string[] {
  const names: string[] = [];
  if (architectures & Architecture.X86_64) names.push('x86_64');
  if (architectures & Architecture.Arm64) names.push('arm64');
  return names;
}

/**
 * Extract serializable install params from a config object.
 */
function extractInstallParams(params: Record<string, unknown>): ISerializableInstallParams {
  const installParams: ISerializableInstallParams = {};
  if (typeof params['repo'] === 'string') installParams.repo = params['repo'];
  if (typeof params['assetPattern'] === 'string') installParams.assetPattern = params['assetPattern'];
  if (typeof params['ghCli'] === 'boolean') installParams.ghCli = params['ghCli'];
  // Handle both 'crate' and 'crateName' (cargo uses crateName internally)
  if (typeof params['crate'] === 'string') installParams.crate = params['crate'];
  if (typeof params['crateName'] === 'string') installParams.crate = params['crateName'];
  if (typeof params['formula'] === 'string') installParams.formula = params['formula'];
  if (typeof params['url'] === 'string') installParams.url = params['url'];
  return installParams;
}

/**
 * Serialize a ToolConfig to a JSON-safe structure.
 * Strips functions and non-serializable fields.
 */
export function serializeToolConfig(config: ToolConfig): ISerializableToolConfig {
  // Extract serializable install params (varies by method)
  const installParams: ISerializableInstallParams = {};

  if ('installParams' in config && config.installParams) {
    const params = config.installParams as Record<string, unknown>;
    Object.assign(installParams, extractInstallParams(params));
  }

  // Serialize platform configs if present
  let platformConfigs: ISerializablePlatformConfigEntry[] | undefined;
  if (config.platformConfigs && config.platformConfigs.length > 0) {
    platformConfigs = config.platformConfigs.map((entry) => {
      const serialized: ISerializablePlatformConfigEntry = {
        platforms: platformBitmaskToNames(entry.platforms),
      };

      if (entry.architectures !== undefined) {
        serialized.architectures = architectureBitmaskToNames(entry.architectures);
      }

      const platformConfig = entry.config;
      if (platformConfig.installationMethod) {
        serialized.installationMethod = platformConfig.installationMethod;
      }
      if (platformConfig.installParams) {
        serialized.installParams = extractInstallParams(platformConfig.installParams as Record<string, unknown>);
      }
      if (platformConfig.binaries) {
        serialized.binaries = platformConfig.binaries;
      }
      if (platformConfig.symlinks) {
        serialized.symlinks = platformConfig.symlinks;
      }

      return serialized;
    });
  }

  return {
    name: config.name,
    version: config.version,
    installationMethod: config.installationMethod,
    installParams,
    binaries: config.binaries,
    dependencies: config.dependencies,
    symlinks: config.symlinks,
    disabled: config.disabled,
    hostname: config.hostname,
    configFilePath: config.configFilePath,
    platformConfigs,
  };
}

/**
 * Get runtime state for a tool from the installation registry.
 */
export function getToolRuntimeState(
  toolName: string,
  installations: Map<string, IToolInstallationRecord>,
): IToolRuntimeState {
  const record = installations.get(toolName);

  if (!record) {
    return {
      status: 'not-installed',
      installedVersion: null,
      installedAt: null,
      installPath: null,
      binaryPaths: [],
      hasUpdate: false,
    };
  }

  return {
    status: 'installed',
    installedVersion: record.version,
    installedAt: record.installedAt.toISOString(),
    installPath: record.installPath,
    binaryPaths: record.binaryPaths || [],
    hasUpdate: false,
  };
}

/**
 * Convert a ToolConfig and registry state to a full IToolDetail.
 * Serializes the original config (including platformConfigs) for visualization.
 */
export function toToolDetail(
  config: ToolConfig,
  installations: Map<string, IToolInstallationRecord>,
  files: IFileState[],
  _systemInfo: ISystemInfo,
  binaryDiskSize: number,
  usage: IToolUsageSummary,
): IToolDetail {
  // Serialize the original config (not resolved) to preserve platformConfigs for visualization
  return {
    config: serializeToolConfig(config),
    runtime: getToolRuntimeState(config.name, installations),
    files,
    binaryDiskSize,
    usage,
  };
}

/**
 * Format a Unix timestamp for display.
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

/**
 * Shell file info for shell integration view.
 */
export interface IShellFile {
  toolName: string;
  filePath: string;
  fileType: 'completion' | 'init';
  lastModified: string;
}

/**
 * Shell integration summary.
 */
export interface IShellIntegration {
  completions: IShellFile[];
  initScripts: IShellFile[];
  totalFiles: number;
}

/**
 * Activity item for activity feed.
 */
export interface IActivityItem {
  id: number;
  toolName: string;
  action: string;
  description: string;
  timestamp: string;
  relativeTime: string;
}

/**
 * Activity feed response.
 */
export interface IActivityFeed {
  activities: IActivityItem[];
  totalCount: number;
}

/**
 * Format a timestamp as relative time (e.g., "2 minutes ago").
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) {
    return 'just now';
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
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
  type: 'directory' | 'file';
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
  timestamp: string;
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
export type TimestampSource = 'git' | 'mtime';

/**
 * Recently added tool file entry.
 */
export interface IRecentToolFile {
  name: string;
  configFilePath: string;
  createdAt: string;
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
  /** Whether the plugin supports update checking */
  supported: boolean;
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
  /** Whether the plugin supports updating */
  supported: boolean;
  /** Error message when update fails */
  error?: string;
}
