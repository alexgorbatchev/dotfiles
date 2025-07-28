/**
 * @file src/modules/versionChecker/VersionChecker.ts
 * @description Implements the IVersionChecker interface for checking tool versions.
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
