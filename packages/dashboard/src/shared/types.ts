import type { IBinaryConfig, ToolConfig } from '@dotfiles/core';
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
  /** GitHub repository (github-release) */
  repo?: string;
  /** Asset pattern (github-release) */
  assetPattern?: string;
  /** Crate name (cargo) */
  crate?: string;
  /** Package name (brew) */
  package?: string;
  /** Script URL (curl-script) */
  scriptUrl?: string;
  /** Archive URL (curl-tar) */
  archiveUrl?: string;
  /** Plugin repository (zsh-plugin) */
  pluginRepo?: string;
}

/**
 * Serializable symlink configuration.
 */
export interface ISerializableSymlink {
  source: string;
  target: string;
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
  configFilePath?: string;
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
 * Serialize a ToolConfig to a JSON-safe structure.
 * Strips functions and non-serializable fields.
 */
export function serializeToolConfig(config: ToolConfig): ISerializableToolConfig {
  // Extract serializable install params (varies by method)
  const installParams: ISerializableInstallParams = {};

  if ('installParams' in config && config.installParams) {
    const params = config.installParams as Record<string, unknown>;
    if (typeof params['repo'] === 'string') installParams.repo = params['repo'];
    if (typeof params['assetPattern'] === 'string') installParams.assetPattern = params['assetPattern'];
    if (typeof params['crate'] === 'string') installParams.crate = params['crate'];
    if (typeof params['package'] === 'string') installParams.package = params['package'];
    if (typeof params['scriptUrl'] === 'string') installParams.scriptUrl = params['scriptUrl'];
    if (typeof params['archiveUrl'] === 'string') installParams.archiveUrl = params['archiveUrl'];
    if (typeof params['pluginRepo'] === 'string') installParams.pluginRepo = params['pluginRepo'];
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
    configFilePath: config.configFilePath,
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
 */
export function toToolDetail(
  config: ToolConfig,
  installations: Map<string, IToolInstallationRecord>,
  files: IFileState[],
): IToolDetail {
  return {
    config: serializeToolConfig(config),
    runtime: getToolRuntimeState(config.name, installations),
    files,
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
}
