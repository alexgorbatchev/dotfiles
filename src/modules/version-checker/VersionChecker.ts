/**
 * @file generator/src/modules/versionChecker/VersionChecker.ts
 * @description Implements the IVersionChecker interface for checking tool versions.
 *
 * ## Development Plan
 *
 * ### Stage 1: Define Interface (IVersionChecker.ts)
 * - [x] Define `VersionComparisonStatus` enum.
 * - [x] Define `IVersionChecker` interface.
 *
 * ### Stage 2: Implement Class (This file)
 * - [x] Import necessary modules (`semver`, `IGitHubApiClient`, `createLogger`, local interface/enum).
 * - [x] Define `VersionChecker` class implementing `IVersionChecker`.
 * - [x] Implement constructor accepting `IGitHubApiClient`.
 * - [x] Implement `getLatestToolVersion` method:
 *   - [x] Use `githubClient` to fetch latest release.
 *   - [x] Extract and clean `tag_name`.
 *   - [x] Add logging.
 *   - [x] Handle errors.
 * - [x] Implement `checkVersionStatus` method:
 *   - [x] Validate input versions using `semver.valid`.
 *   - [x] Compare versions using `semver.gt`, `semver.eq`.
 *   - [x] Add logging.
 * - [ ] Write tests for the module (covered in VersionChecker.test.ts).
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Ensure 100% test coverage for executable code.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { valid, gt, eq } from 'semver';
import type { IGitHubApiClient } from '@modules/github-client/IGitHubApiClient.ts';
import { createLogger } from '../logger/createLogger.ts';
import type { IVersionChecker } from './IVersionChecker.ts';
import { VersionComparisonStatus } from './IVersionChecker.ts';

const log = createLogger('VersionChecker');

export class VersionChecker implements IVersionChecker {
  private readonly githubClient: IGitHubApiClient;

  constructor(githubClient: IGitHubApiClient) {
    log('constructor: Initializing VersionChecker with githubClient');
    this.githubClient = githubClient;
  }

  async getLatestToolVersion(owner: string, repo: string): Promise<string | null> {
    log('getLatestToolVersion: Fetching latest version for owner=%s, repo=%s', owner, repo);
    try {
      const release = await this.githubClient.getLatestRelease(owner, repo);
      if (release && release.tag_name) {
        // Remove 'v' prefix if present, common in tags
        const version = release.tag_name.replace(/^v/, '');
        log(
          'getLatestToolVersion: Successfully fetched latest version=%s for owner=%s, repo=%s',
          version,
          owner,
          repo
        );
        return version;
      }
      log('getLatestToolVersion: No release or tag_name found for owner=%s, repo=%s', owner, repo);
      return null;
    } catch (error) {
      log(
        'getLatestToolVersion: Error fetching latest version for owner=%s, repo=%s, error=%o',
        owner,
        repo,
        error
      );
      return null;
    }
  }

  async checkVersionStatus(
    currentVersion: string,
    latestVersion: string
  ): Promise<VersionComparisonStatus> {
    log(
      'checkVersionStatus: Comparing currentVersion=%s with latestVersion=%s',
      currentVersion,
      latestVersion
    );

    const cleanCurrentVersion = currentVersion.replace(/^v/, '');
    const cleanLatestVersion = latestVersion.replace(/^v/, '');

    if (!valid(cleanCurrentVersion)) {
      log('checkVersionStatus: Invalid currentVersion format: %s', cleanCurrentVersion);
      return VersionComparisonStatus.INVALID_CURRENT_VERSION;
    }
    if (!valid(cleanLatestVersion)) {
      log('checkVersionStatus: Invalid latestVersion format: %s', cleanLatestVersion);
      return VersionComparisonStatus.INVALID_LATEST_VERSION;
    }

    if (gt(cleanLatestVersion, cleanCurrentVersion)) {
      log(
        'checkVersionStatus: Newer version available. Current=%s, Latest=%s',
        cleanCurrentVersion,
        cleanLatestVersion
      );
      return VersionComparisonStatus.NEWER_AVAILABLE;
    }
    if (eq(cleanLatestVersion, cleanCurrentVersion)) {
      log(
        'checkVersionStatus: Versions are the same. Current=%s, Latest=%s',
        cleanCurrentVersion,
        cleanLatestVersion
      );
      return VersionComparisonStatus.UP_TO_DATE;
    }
    // This implies lt(cleanLatestVersion, cleanCurrentVersion)
    log(
      'checkVersionStatus: Current version is ahead of latest. Current=%s, Latest=%s',
      cleanCurrentVersion,
      cleanLatestVersion
    );
    return VersionComparisonStatus.AHEAD_OF_LATEST;
  }
}
