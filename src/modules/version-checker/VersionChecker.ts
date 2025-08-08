import { valid, gt, eq } from 'semver';
import type { IGitHubApiClient } from '@modules/github-client';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import type { IVersionChecker } from './IVersionChecker.ts';
import { VersionComparisonStatus } from './IVersionChecker.ts';

export class VersionChecker implements IVersionChecker {
  private readonly githubClient: IGitHubApiClient;
  private readonly logger: TsLogger;

  constructor(parentLogger: TsLogger, githubClient: IGitHubApiClient) {
    this.logger = parentLogger.getSubLogger({ name: 'VersionChecker' });
    this.logger.debug(logs.versionChecker.debug.constructorInit());
    this.githubClient = githubClient;
  }

  async getLatestToolVersion(owner: string, repo: string): Promise<string | null> {
    const logger = this.logger.getSubLogger({ name: 'getLatestToolVersion' });
    logger.debug(logs.versionChecker.debug.fetchingLatest(), owner, repo);
    try {
      const release = await this.githubClient.getLatestRelease(owner, repo);
      if (release && release.tag_name) {
        // Remove 'v' prefix if present, common in tags
        const version = release.tag_name.replace(/^v/, '');
        logger.debug(logs.versionChecker.debug.latestReleaseFound(), version);
        return version;
      }
      logger.debug(logs.versionChecker.debug.noLatestRelease(), owner, repo);
      return null;
    } catch (error) {
      logger.debug(logs.versionChecker.debug.latestReleaseError(), owner, repo, (error as Error).message);
      return null;
    }
  }

  async checkVersionStatus(
    currentVersion: string,
    latestVersion: string,
  ): Promise<VersionComparisonStatus> {
    const logger = this.logger.getSubLogger({ name: 'checkVersionStatus' });
    logger.debug(logs.versionChecker.debug.comparingVersions(), currentVersion, latestVersion);

    const cleanCurrentVersion = currentVersion.replace(/^v/, '');
    const cleanLatestVersion = latestVersion.replace(/^v/, '');

    if (!valid(cleanCurrentVersion)) {
      logger.debug(logs.versionChecker.debug.invalidConfiguredVersion(), cleanCurrentVersion);
      return VersionComparisonStatus.INVALID_CURRENT_VERSION;
    }
    if (!valid(cleanLatestVersion)) {
      logger.debug(logs.versionChecker.debug.invalidLatestVersion(), cleanLatestVersion);
      return VersionComparisonStatus.INVALID_LATEST_VERSION;
    }

    if (gt(cleanLatestVersion, cleanCurrentVersion)) {
      logger.debug(logs.versionChecker.debug.versionComparisonResult(), 'NEWER_AVAILABLE');
      return VersionComparisonStatus.NEWER_AVAILABLE;
    }
    if (eq(cleanLatestVersion, cleanCurrentVersion)) {
      logger.debug(logs.versionChecker.debug.versionComparisonResult(), 'UP_TO_DATE');
      return VersionComparisonStatus.UP_TO_DATE;
    }
    // This implies lt(cleanLatestVersion, cleanCurrentVersion)
    logger.debug(logs.versionChecker.debug.versionComparisonResult(), 'AHEAD_OF_LATEST');
    return VersionComparisonStatus.AHEAD_OF_LATEST;
  }
}
