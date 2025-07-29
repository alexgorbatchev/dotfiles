import { valid, gt, eq } from 'semver';
import type { IGitHubApiClient } from '@modules/github-client';
import type { TsLogger } from '@modules/logger';
import type { IVersionChecker } from './IVersionChecker.ts';
import { VersionComparisonStatus } from './IVersionChecker.ts';

export class VersionChecker implements IVersionChecker {
  private readonly githubClient: IGitHubApiClient;
  private readonly logger: TsLogger;

  constructor(parentLogger: TsLogger, githubClient: IGitHubApiClient) {
    this.logger = parentLogger.getSubLogger({ name: 'VersionChecker' });
    this.logger.debug('constructor: Initializing VersionChecker with githubClient');
    this.githubClient = githubClient;
  }

  async getLatestToolVersion(owner: string, repo: string): Promise<string | null> {
    const logger = this.logger.getSubLogger({ name: 'getLatestToolVersion' });
    logger.debug('Fetching latest version for owner=%s, repo=%s', owner, repo);
    try {
      const release = await this.githubClient.getLatestRelease(owner, repo);
      if (release && release.tag_name) {
        // Remove 'v' prefix if present, common in tags
        const version = release.tag_name.replace(/^v/, '');
        logger.debug(
          'Successfully fetched latest version=%s for owner=%s, repo=%s',
          version,
          owner,
          repo,
        );
        return version;
      }
      logger.debug('No release or tag_name found for owner=%s, repo=%s', owner, repo);
      return null;
    } catch (error) {
      logger.debug(
        'Error fetching latest version for owner=%s, repo=%s, error=%o',
        owner,
        repo,
        error,
      );
      return null;
    }
  }

  async checkVersionStatus(
    currentVersion: string,
    latestVersion: string,
  ): Promise<VersionComparisonStatus> {
    const logger = this.logger.getSubLogger({ name: 'checkVersionStatus' });
    logger.debug('Comparing currentVersion=%s with latestVersion=%s', currentVersion, latestVersion);

    const cleanCurrentVersion = currentVersion.replace(/^v/, '');
    const cleanLatestVersion = latestVersion.replace(/^v/, '');

    if (!valid(cleanCurrentVersion)) {
      logger.debug('Invalid currentVersion format: %s', cleanCurrentVersion);
      return VersionComparisonStatus.INVALID_CURRENT_VERSION;
    }
    if (!valid(cleanLatestVersion)) {
      logger.debug('Invalid latestVersion format: %s', cleanLatestVersion);
      return VersionComparisonStatus.INVALID_LATEST_VERSION;
    }

    if (gt(cleanLatestVersion, cleanCurrentVersion)) {
      logger.debug(
        'Newer version available. Current=%s, Latest=%s',
        cleanCurrentVersion,
        cleanLatestVersion,
      );
      return VersionComparisonStatus.NEWER_AVAILABLE;
    }
    if (eq(cleanLatestVersion, cleanCurrentVersion)) {
      logger.debug(
        'Versions are the same. Current=%s, Latest=%s',
        cleanCurrentVersion,
        cleanLatestVersion,
      );
      return VersionComparisonStatus.UP_TO_DATE;
    }
    // This implies lt(cleanLatestVersion, cleanCurrentVersion)
    logger.debug(
      'Current version is ahead of latest. Current=%s, Latest=%s',
      cleanCurrentVersion,
      cleanLatestVersion,
    );
    return VersionComparisonStatus.AHEAD_OF_LATEST;
  }
}
