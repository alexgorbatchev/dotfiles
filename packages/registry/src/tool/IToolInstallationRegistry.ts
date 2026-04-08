import type { IToolInstallationDetails, IToolInstallationRecord, IToolUsageRecord } from "./types";

/**
 * Registry interface for managing tool installation records in a persistent database.
 *
 * Maintains a SQLite database with a `tool_installations` table that enforces unique tool names.
 * Each tool can have only one installation record at a time. The registry tracks installation
 * metadata including version, binary paths, download URLs, and timestamps for upgrade detection
 * and installation tracking.
 *
 * @example
 * ```typescript
 * // Record a new tool installation (replaces existing record if tool already installed)
 * await registry.recordToolInstallation({
 *   toolName: 'ripgrep',
 *   version: '14.1.0',
 *   installPath: '/path/to/generated/binaries/ripgrep/20231028-120000',
 *   timestamp: '20231028-120000',
 *   binaryPaths: ['/path/to/generated/binaries/ripgrep/20231028-120000/rg'],
 *   downloadUrl: 'https://github.com/BurntSushi/ripgrep/releases/...',
 *   assetName: 'ripgrep-14.1.0-x86_64-apple-darwin.tar.gz',
 *   configuredVersion: 'latest'
 * });
 *
 * // Check if a specific version is installed
 * const isInstalled = await registry.isToolInstalled('ripgrep', '14.1.0');
 * ```
 */
export interface IToolInstallationRegistry {
  /**
   * Records a tool installation in the registry using INSERT OR REPLACE.
   *
   * If a tool with the same name already exists, its record is completely replaced.
   * The `installedAt` timestamp is automatically set to `Date.now()` and the `id` is
   * auto-generated. Binary paths are stored as JSON in the database.
   *
   * @param installation - Tool installation details excluding auto-generated fields (id, installedAt)
   * @returns Promise that resolves when the installation is recorded
   */
  recordToolInstallation(installation: IToolInstallationDetails): Promise<void>;

  /**
   * Retrieves the installation record for a specific tool by name.
   *
   * Returns the single installation record matching the tool name, or null if not found.
   * Since tool names are unique in the database, only one record can exist per tool.
   *
   * The returned `version` field contains the actual installed version of the tool as reported
   * during installation:
   * - **github-release**: GitHub release tag name (e.g., "v14.1.0")
   * - **cargo**: Version from Cargo.toml, crates.io, or GitHub releases
   * - **brew**: Version from `brew info --json` (e.g., "14.1.0")
   * - **curl-script, curl-tar, manual**: Typically no version, so not recorded in registry
   *
   * @param toolName - Exact name of the tool to look up
   * @returns Promise resolving to the tool installation record with actual version, or null if not found
   */
  getToolInstallation(toolName: string): Promise<IToolInstallationRecord | null>;

  /**
   * Retrieves all tool installation records from the registry, ordered by tool name.
   *
   * Returns the complete list of installed tools. Since the database enforces unique
   * tool names, each tool appears only once.
   *
   * The `version` field in each record contains the actual installed version as reported
   * during installation:
   * - **github-release**: GitHub release tag name (e.g., "v14.1.0")
   * - **cargo**: Version from Cargo.toml, crates.io, or GitHub releases
   * - **brew**: Version from `brew info --json` (e.g., "14.1.0")
   * - **curl-script, curl-tar, manual**: Typically no version, so not recorded in registry
   *
   * Note: Only tools that successfully report a version during installation are included
   * in the registry.
   *
   * @returns Promise resolving to an array of all tool installation records with actual versions (alphabetically sorted)
   */
  getAllToolInstallations(): Promise<IToolInstallationRecord[]>;

  /**
   * Updates specific fields of an existing tool installation record.
   *
   * Only the fields provided in the `updates` parameter are modified. If no fields
   * are provided, the method returns without performing any database operation.
   * If the tool doesn't exist, the UPDATE statement silently succeeds without error.
   *
   * @param toolName - Name of the tool to update
   * @param updates - Partial installation record with fields to update (version, installPath, timestamp, binaryPaths, downloadUrl, assetName, configuredVersion)
   * @returns Promise that resolves when the update is complete
   */
  updateToolInstallation(toolName: string, updates: Partial<IToolInstallationRecord>): Promise<void>;

  /**
   * Removes a tool installation record from the registry.
   *
   * Deletes only the database record for the specified tool. The actual installed files
   * in the file system remain untouched. If the tool doesn't exist, the DELETE statement
   * silently succeeds without error.
   *
   * @param toolName - Name of the tool to remove from the registry
   * @returns Promise that resolves when the removal is complete
   */
  removeToolInstallation(toolName: string): Promise<void>;

  /**
   * Checks whether a tool is installed, with optional version verification.
   *
   * When `version` is provided, checks for an exact match of both tool name and version.
   * When `version` is omitted, returns true if any version of the tool is installed.
   *
   * @param toolName - Name of the tool to check
   * @param version - Optional specific version to verify (exact match required)
   * @returns Promise resolving to true if the tool (and version, if specified) is installed, false otherwise
   */
  isToolInstalled(toolName: string, version?: string): Promise<boolean>;

  /**
   * Records a shim invocation for a tool binary.
   *
   * Creates or increments a usage counter keyed by `(toolName, binaryName)` and updates
   * the last-used timestamp.
   *
   * @param toolName - Name of the tool that owns the shim
   * @param binaryName - Name of the executed binary shim
   * @returns Promise that resolves when usage has been recorded
   */
  recordToolUsage(toolName: string, binaryName: string): Promise<void>;

  /**
   * Retrieves usage stats for a specific `(toolName, binaryName)` pair.
   *
   * @param toolName - Name of the tool
   * @param binaryName - Name of the binary shim
   * @returns Promise resolving to usage stats, or null if no usage has been recorded
   */
  getToolUsage(toolName: string, binaryName: string): Promise<IToolUsageRecord | null>;

  /**
   * Closes the database connection and releases resources.
   *
   * Closes the underlying SQLite database connection. No other methods should be called
   * after invoking this method.
   *
   * @returns Promise that resolves when the database is closed
   */
  close(): Promise<void>;
}
