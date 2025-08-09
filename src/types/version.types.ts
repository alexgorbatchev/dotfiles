import type { ToolConfig } from './resolvedToolConfig.types';

/**
 * Contains information about an available update for a tool.
 * This includes the current and latest versions, whether an update is indeed available,
 * and optional details like release notes and download URLs.
 */
export interface UpdateInfo {
  /** The name of the tool for which update information is provided. */
  toolName: string;
  /** The currently installed version of the tool. */
  currentVersion: string;
  /** The latest available version of the tool found. */
  latestVersion: string;
  /** A boolean flag indicating whether `latestVersion` is newer than `currentVersion`. */
  updateAvailable: boolean;
  /** Optional release notes or changelog for the `latestVersion`. */
  releaseNotes?: string;
  /** Optional direct download URL for the `latestVersion` asset, if applicable. */
  downloadUrl?: string;
  /** An optional ISO 8601 date string indicating when the `latestVersion` was published. */
  publishedAt?: string;
}

/**
 * Defines the set of operators that can be used in a version constraint string.
 * These operators are typically used in SemVer (Semantic Versioning) comparisons.
 * - `=` : Equal to
 * - `>` : Greater than
 * - `>=`: Greater than or equal to
 * - `<` : Less than
 * - `<=` : Less than or equal to
 * - `~` : Approximately equivalent to (allows patch-level changes if a minor version is specified,
 *         or minor-level changes if only a major version is specified). E.g., `~1.2.3` matches `>=1.2.3 <1.3.0`.
 * - `^` : Compatible with (allows changes that do not modify the left-most non-zero digit).
 *         E.g., `^1.2.3` matches `>=1.2.3 <2.0.0`. `^0.2.3` matches `>=0.2.3 <0.3.0`.
 */
export type VersionConstraintOperator = '=' | '>' | '>=' | '<' | '<=' | '~' | '^';

/**
 * Represents a parsed version constraint, consisting of an operator and a version string.
 * A full constraint string (e.g., ">=1.0.0 <2.0.0") might be parsed into multiple
 * `VersionConstraint` objects.
 */
export interface VersionConstraint {
  /** The {@link VersionConstraintOperator} used for the comparison. */
  operator: VersionConstraintOperator;
  /** The version string to compare against (e.g., "1.2.3"). */
  version: string;
}

/**
 * Defines the contract for a version checking service.
 * Implementations of this interface are responsible for checking for tool updates,
 * parsing version constraint strings, and determining if a version satisfies a given constraint.
 */
export interface IVersionChecker {
  /**
   * Checks for an update for a single specified tool based on its configuration.
   * @param tool The {@link ToolConfig} of the tool to check.
   * @returns A promise that resolves with {@link UpdateInfo} if an update check is performed
   *          (regardless of whether an update is available), or `null` if the check is skipped
   *          (e.g., tool not installed, update checking disabled for the tool).
   */
  checkForUpdate(tool: ToolConfig): Promise<UpdateInfo | null>;

  /**
   * Checks for updates for all tools currently managed by the system (e.g., listed in the manifest).
   * @returns A promise that resolves with an array of {@link UpdateInfo} objects for all tools
   *          for which an update check was performed.
   */
  checkAllForUpdates(): Promise<UpdateInfo[]>;

  /**
   * Parses a version constraint string (e.g., ">=1.0.0 <2.0.0 || ^3.0.0") into an array
   * of {@link VersionConstraint} objects.
   * This is useful for breaking down complex SemVer ranges into individual comparable parts.
   * @param constraint The version constraint string to parse.
   * @returns An array of {@link VersionConstraint} objects.
   */
  parseVersionConstraint(constraint: string): VersionConstraint[];

  /**
   * Checks if a given version string satisfies a version constraint string.
   * This typically uses SemVer comparison logic.
   * @param version The version string to check (e.g., "1.2.3").
   * @param constraint The version constraint string to check against (e.g., "^1.2.0", ">=2.0.0").
   * @returns `true` if the version satisfies the constraint, `false` otherwise.
   */
  satisfiesConstraint(version: string, constraint: string): boolean;
}
