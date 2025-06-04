/**
 * @file generator/src/modules/versionChecker/IVersionChecker.ts
 * @description Defines the interface for the version checker module.
 * This module is responsible for determining if newer versions of managed tools are available.
 *
 * ## Development Plan
 *
 * ### Stage 1: Define Interface (This file)
 * - [x] Define `VersionComparisonStatus` enum.
 * - [x] Define `IVersionChecker` interface with methods:
 *   - `getLatestToolVersion(owner: string, repo: string): Promise<string | null>`
 *   - `checkVersionStatus(currentVersion: string, latestVersion: string): Promise<VersionComparisonStatus>`
 * - [ ] Write tests for the module (covered in VersionChecker.test.ts).
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Ensure 100% test coverage for executable code (N/A for interface file).
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

/**
 * Represents the result of comparing two semantic versions.
 */
export enum VersionComparisonStatus {
  /**
   * The latest version is newer than the current version.
   */
  NEWER_AVAILABLE = 'NEWER_AVAILABLE',
  /**
   * The current version is the same as the latest version.
   */
  UP_TO_DATE = 'UP_TO_DATE',
  /**
   * The current version is ahead of the latest known version (e.g., a development build).
   */
  AHEAD_OF_LATEST = 'AHEAD_OF_LATEST',
  /**
   * The provided current version string is not a valid semantic version.
   */
  INVALID_CURRENT_VERSION = 'INVALID_CURRENT_VERSION',
  /**
   * The provided latest version string is not a valid semantic version.
   */
  INVALID_LATEST_VERSION = 'INVALID_LATEST_VERSION',
}

/**
 * Interface for a service that checks tool versions.
 */
export interface IVersionChecker {
  /**
   * Gets the latest version string for a tool from a GitHub repository.
   * @param owner The owner of the GitHub repository.
   * @param repo The name of the GitHub repository.
   * @returns A promise that resolves to the latest version string (e.g., "1.2.3"),
   *          or null if the version cannot be determined or an error occurs.
   *          The version string typically excludes prefixes like 'v'.
   */
  getLatestToolVersion(owner: string, repo: string): Promise<string | null>;

  /**
   * Compares a current version string with a latest version string to determine the update status.
   * @param currentVersion The current version string of the tool (e.g., "1.0.0").
   * @param latestVersion The latest available version string of the tool (e.g., "1.1.0").
   * @returns A promise that resolves to a `VersionComparisonStatus` indicating the relationship
   *          between the two versions.
   */
  checkVersionStatus(
    currentVersion: string,
    latestVersion: string
  ): Promise<VersionComparisonStatus>;
}
