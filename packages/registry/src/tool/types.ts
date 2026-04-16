/**
 * Base details type that all installer metadata should extend via Partial<>.
 * Contains the common fields needed for tool installation registry.
 *
 * Required fields (always provided by Installer):
 * - toolName, version, installPath, timestamp, binaryPaths
 *
 * Optional fields (provided by specific installer plugins via metadata):
 * - downloadUrl, assetName, configuredVersion, originalTag
 */
export interface IToolInstallationDetails {
  toolName: string;
  version: string;
  installPath: string;
  timestamp: string;
  binaryPaths: string[];
  downloadUrl?: string;
  assetName?: string;
  configuredVersion?: string;
  originalTag?: string;
  /** Installation method used (e.g., 'brew', 'github-release', 'cargo', 'manual') */
  installMethod?: string;
}

/**
 * Complete tool installation record as stored in the registry database.
 * Extends IToolInstallationDetails with auto-generated database fields.
 */
export interface IToolInstallationRecord extends IToolInstallationDetails {
  id: number;
  readonly installedAt: Date;
}

/**
 * Aggregate usage stats for a tool binary invocation tracked from shims.
 */
export interface IToolUsageRecord {
  toolName: string;
  binaryName: string;
  usageCount: number;
  readonly lastUsedAt: Date;
}

/**
 * Optional values used when recording shim usage.
 */
export interface IRecordToolUsageOptions {
  count?: number;
  lastUsedAt?: Date;
}

/**
 * A raw usage event parsed from the append-only shim usage log.
 */
export interface IToolUsageLogEntry {
  toolName: string;
  binaryName: string;
  usedAt: Date;
}
