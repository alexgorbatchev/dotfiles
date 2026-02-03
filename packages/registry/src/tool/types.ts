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
