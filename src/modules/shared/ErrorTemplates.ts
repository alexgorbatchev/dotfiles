/**
 * Standardized error message templates for consistent logging across the application.
 * 
 * Usage:
 * ```typescript
 * import { ErrorTemplates } from '@modules/shared/ErrorTemplates';
 * 
 * // Instead of:
 * logger.error('install: Error installing tool %s: %O', toolName, error);
 * 
 * // Use:
 * logger.error(ErrorTemplates.tool.installFailed('github-release', toolName, error.message));
 * logger.debug('Installation error details: %O', error);
 * ```
 */
export const ErrorTemplates = {
  /**
   * Tool lifecycle operations (install, update, cleanup, conflicts)
   */
  tool: {
    installFailed: (method: string, toolName: string, reason: string) => 
      `Installation failed [${method}] for tool "${toolName}": ${reason}`,
    updateFailed: (toolName: string, reason: string) => 
      `Update failed for tool "${toolName}": ${reason}`,
    cleanupFailed: (toolName: string, reason: string) => 
      `Cleanup failed for tool "${toolName}": ${reason}`,
    conflictDetected: (toolName: string, conflict: string) => 
      `Conflict detected for tool "${toolName}": ${conflict}`,
    notFound: (toolName: string, source: string) => 
      `Tool "${toolName}" not found in ${source}`,
    versionNotFound: (toolName: string, version: string, source: string) => 
      `Version "${version}" of tool "${toolName}" not found in ${source}`,
    installationCorrupted: (toolName: string, path: string) => 
      `Installation of tool "${toolName}" appears corrupted at ${path}`,
    dependencyMissing: (toolName: string, dependency: string) => 
      `Tool "${toolName}" requires missing dependency: ${dependency}`,
  },

  /**
   * File system operations (read, write, symlinks, permissions)
   */
  fs: {
    notFound: (itemType: string, path: string) => 
      `${itemType} not found: ${path}`,
    accessDenied: (operation: string, path: string) => 
      `Access denied ${operation}: ${path}`,
    readFailed: (path: string, reason: string) => 
      `Failed to read ${path}: ${reason}`,
    writeFailed: (path: string, reason: string) => 
      `Failed to write ${path}: ${reason}`,
    symlinkFailed: (source: string, target: string, reason: string) => 
      `Failed to create symlink ${source} → ${target}: ${reason}`,
    symlinkCorrupted: (target: string, expected: string, actual: string) => 
      `Symlink ${target} points to "${actual}", expected "${expected}"`,
    permissionsFailed: (path: string, permissions: string, reason: string) => 
      `Failed to set permissions ${permissions} on ${path}: ${reason}`,
    directoryCreateFailed: (path: string, reason: string) => 
      `Failed to create directory ${path}: ${reason}`,
    deleteFailed: (path: string, reason: string) => 
      `Failed to delete ${path}: ${reason}`,
  },

  /**
   * Configuration loading and validation
   */
  config: {
    validationFailed: (errors: string[]) => 
      `Configuration validation failed:\n${errors.join('\n')}`,
    loadFailed: (configPath: string, reason: string) => 
      `Failed to load configuration from ${configPath}: ${reason}`,
    required: (field: string, example?: string) => 
      `Required configuration missing: ${field}${example ? `. Example: ${example}` : ''}`,
    invalid: (field: string, value: string, expected: string) => 
      `Invalid ${field}: "${value}" (expected ${expected})`,
    parseError: (configPath: string, format: string, reason: string) => 
      `Failed to parse ${format} configuration ${configPath}: ${reason}`,
    schemaError: (field: string, issue: string) => 
      `Configuration schema error in ${field}: ${issue}`,
  },

  /**
   * External service integrations
   */
  service: {
    github: {
      apiFailed: (operation: string, status: number, message: string) => 
        `GitHub API failed [${operation}] ${status}: ${message}`,
      rateLimited: (resetTime: string) => 
        `GitHub API rate limited. Resets at ${resetTime}`,
      unauthorized: () => 'GitHub API authentication failed. Check your token',
      notFound: (resource: string, identifier: string) => 
        `GitHub ${resource} not found: ${identifier}`,
      networkError: (operation: string, reason: string) => 
        `GitHub API network error [${operation}]: ${reason}`,
      quotaExceeded: (quotaType: string, limit: number) => 
        `GitHub API ${quotaType} quota exceeded (limit: ${limit})`,
    },
    network: {
      downloadFailed: (url: string, reason: string) => 
        `Download failed from ${url}: ${reason}`,
      timeoutExceeded: (operation: string, timeout: number) => 
        `${operation} timed out after ${timeout}ms`,
      connectionFailed: (host: string, reason: string) => 
        `Connection failed to ${host}: ${reason}`,
      invalidUrl: (url: string) => 
        `Invalid URL: ${url}`,
      checksumMismatch: (file: string, expected: string, actual: string) => 
        `Checksum mismatch for ${file}: expected ${expected}, got ${actual}`,
    },
  },

  /**
   * Command execution and CLI
   */
  command: {
    executionFailed: (command: string, exitCode: number, stderr: string) => 
      `Command failed [${command}] exit ${exitCode}: ${stderr}`,
    notFound: (command: string) => 
      `Command not found: ${command}`,
    permissionDenied: (command: string) => 
      `Permission denied executing: ${command}`,
    invalidArgs: (command: string, provided: string, expected: string) => 
      `Invalid arguments for ${command}: provided "${provided}", expected ${expected}`,
    timeout: (command: string, timeoutMs: number) => 
      `Command timed out [${command}] after ${timeoutMs}ms`,
    interruptedByUser: (command: string) => 
      `Command interrupted by user: ${command}`,
  },

  /**
   * Archive and extraction operations
   */
  archive: {
    extractFailed: (archivePath: string, reason: string) => 
      `Failed to extract archive ${archivePath}: ${reason}`,
    unsupportedFormat: (archivePath: string, detectedFormat: string) => 
      `Unsupported archive format: ${archivePath} (detected: ${detectedFormat})`,
    corruptedArchive: (archivePath: string) => 
      `Archive appears corrupted: ${archivePath}`,
    extractPathNotFound: (archivePath: string, extractPath: string) => 
      `Extract path not found in archive ${archivePath}: ${extractPath}`,
    noExecutablesFound: (archivePath: string) => 
      `No executable files found in archive: ${archivePath}`,
  },
} as const;

/**
 * Warning message templates for consistent logging
 */
export const WarningTemplates = {
  tool: {
    alreadyInstalled: (toolName: string, version: string) => 
      `Tool "${toolName}" version ${version} is already installed`,
    outdatedVersion: (toolName: string, current: string, latest: string) => 
      `Tool "${toolName}" version ${current} is outdated (latest: ${latest})`,
    unusedTool: (toolName: string, lastUsed: string) => 
      `Tool "${toolName}" hasn't been used since ${lastUsed}`,
    versionComparisonFailed: (toolName: string, current: string, latest: string) => 
      `Could not determine update status for ${toolName} (${current}) against latest ${latest}`,
    conflictsDetected: (header: string, conflicts: string) => 
      `${header}\n${conflicts}`,
  },
  config: {
    deprecated: (field: string, replacement: string) => 
      `Configuration field "${field}" is deprecated. Use "${replacement}" instead`,
    ignored: (field: string, reason: string) => 
      `Configuration field "${field}" ignored: ${reason}`,
    defaultUsed: (field: string, defaultValue: string) => 
      `Using default value for ${field}: ${defaultValue}`,
    invalid: (field: string, value: string, expected: string) => 
      `Invalid ${field}: "${value}" (expected ${expected})`,
  },
  fs: {
    overwriting: (toolName: string, path: string) => 
      `[${toolName}] Overwriting existing file: ${path}`,
    permissionsFixed: (path: string, newPermissions: string) => 
      `Fixed permissions on ${path} to ${newPermissions}`,
    readFailed: (path: string, reason: string) => 
      `Failed to read ${path}: ${reason}`,
    notFound: (itemType: string, path: string) => 
      `${itemType} not found: ${path}`,
  },
  service: {
    github: {
      notFound: (resource: string, identifier: string) => 
        `GitHub ${resource} not found: ${identifier}`,
    },
  },
} as const;

/**
 * Success message templates for consistent positive feedback
 */
export const SuccessTemplates = {
  tool: {
    installed: (toolName: string, version: string, method: string) => 
      `Tool "${toolName}" v${version} installed successfully using ${method}`,
    updated: (toolName: string, fromVersion: string, toVersion: string) => 
      `Tool "${toolName}" updated from v${fromVersion} to v${toVersion}`,
    removed: (toolName: string) => 
      `Tool "${toolName}" removed successfully`,
    processing: (toolName: string, operation: string) => `Processing ${toolName} (${operation})`,
    processingComplete: (toolName: string, operation: string, duration?: number) => 
      `Completed ${toolName} (${operation})${duration ? ` in ${duration}ms` : ''}`,
  },
  config: {
    loaded: (configPath: string, toolCount: number) => 
      `Configuration loaded from ${configPath} (${toolCount} tools configured)`,
    validated: (configPath: string) => 
      `Configuration validated successfully: ${configPath}`,
  },
  operation: {
    completed: (operation: string, duration: number, itemCount?: number) => 
      `${operation} completed in ${duration}ms${itemCount ? ` (${itemCount} items)` : ''}`,
  },
  fs: {
    created: (toolName: string, path: string) => `[${toolName}] Created: ${path}`,
    updated: (toolName: string, path: string) => `[${toolName}] Updated: ${path}`,
    removed: (toolName: string, path: string) => `[${toolName}] Removed: ${path}`,
    removedDirectory: (toolName: string, path: string) => `[${toolName}] Removed directory: ${path}`,
    moved: (toolName: string, oldPath: string, newPath: string) => `[${toolName}] Moved: ${oldPath} → ${newPath}`,
    copied: (toolName: string, srcPath: string, destPath: string) => `[${toolName}] Copied: ${srcPath} → ${destPath}`,
    symlinkCreated: (toolName: string, linkPath: string, targetPath: string) => `[${toolName}] Created symlink: ${linkPath} → ${targetPath}`,
    permissionsChanged: (toolName: string, path: string, mode: string | number) => `[${toolName}] Changed permissions: ${path} (${mode})`,
    directoryCreated: (toolName: string, path: string) => `[${toolName}] Created directory: ${path}`,
  },
  registry: {
    initialized: (path: string) => `File tracking initialized: ${path}`,
    operationsTracked: (count: number, toolName: string) => `Tracked ${count} file operations for ${toolName}`,
    summaryStats: (totalFiles: number, totalTools: number) => `Registry contains ${totalFiles} files across ${totalTools} tools`,
  },
} as const;