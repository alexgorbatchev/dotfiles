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
