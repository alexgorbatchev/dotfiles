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
 * Tool summary for catalog listing.
 */
export interface IToolSummary {
  name: string;
  version: string | null;
  installMethod: string | null;
  status: 'installed' | 'not-installed' | 'error';
  installedAt: string | null;
  hasUpdate: boolean;
  /** Install path - included for file tree display */
  installPath?: string | null;
  /** Binary paths - included for file tree display */
  binaryPaths?: string[];
  /** Download URL - included for file tree display */
  downloadUrl?: string | null;
}

/**
 * Extended tool details for detail view.
 */
export interface IToolDetail extends IToolSummary {
  installPath: string | null;
  binaryPaths: string[];
  downloadUrl: string | null;
  assetName: string | null;
  configuredVersion: string | null;
  files: IFileState[];
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
 * Convert a tool installation record to a tool summary.
 */
export function toToolSummary(record: IToolInstallationRecord): IToolSummary {
  return {
    name: record.toolName,
    version: record.version,
    installMethod: extractInstallMethod(record.downloadUrl),
    status: 'installed',
    installedAt: record.installedAt.toISOString(),
    hasUpdate: false,
    installPath: record.installPath,
    binaryPaths: record.binaryPaths,
    downloadUrl: record.downloadUrl ?? null,
  };
}

/**
 * Extract installation method from download URL.
 */
function extractInstallMethod(downloadUrl: string | undefined): string | null {
  if (!downloadUrl) {
    return null;
  }
  if (downloadUrl.includes('github.com') || downloadUrl.includes('api.github.com')) {
    return 'github-release';
  }
  if (downloadUrl.includes('crates.io')) {
    return 'cargo';
  }
  if (downloadUrl.includes('homebrew') || downloadUrl.includes('brew')) {
    return 'brew';
  }
  return 'manual';
}

/**
 * Convert a tool installation record to tool detail.
 */
export function toToolDetail(record: IToolInstallationRecord, files: IFileState[]): IToolDetail {
  return {
    ...toToolSummary(record),
    installPath: record.installPath,
    binaryPaths: record.binaryPaths,
    downloadUrl: record.downloadUrl ?? null,
    assetName: record.assetName ?? null,
    configuredVersion: record.configuredVersion ?? null,
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
