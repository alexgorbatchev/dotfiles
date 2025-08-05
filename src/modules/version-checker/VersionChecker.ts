import { valid, gt, eq } from 'semver';
import type { IGitHubApiClient } from '@modules/github-client';
import type { TsLogger } from '@modules/logger';
import type { IVersionChecker } from './IVersionChecker.ts';
import { VersionComparisonStatus } from './IVersionChecker.ts';
import { DebugTemplates } from '@modules/shared/ErrorTemplates';

export class VersionChecker implements IVersionChecker {
  private readonly githubClient: IGitHubApiClient;
  private readonly logger: TsLogger;

  constructor(parentLogger: TsLogger, githubClient: IGitHubApiClient) {
    this.logger = parentLogger.getSubLogger({ name: 'VersionChecker' });
    this.logger.debug(DebugTemplates.versionChecker.constructorInit());
    this.githubClient = githubClient;
  }

  async getLatestToolVersion(owner: string, repo: string): Promise<string | null> {
    const logger = this.logger.getSubLogger({ name: 'getLatestToolVersion' });
    logger.debug(DebugTemplates.versionChecker.fetchingLatest(), owner, repo);
    try {
      const release = await this.githubClient.getLatestRelease(owner, repo);
      if (release && release.tag_name) {
        // Remove 'v' prefix if present, common in tags
        const version = release.tag_name.replace(/^v/, '');
        logger.debug(DebugTemplates.versionChecker.latestReleaseFound(), version);
        return version;
      }
      logger.debug(DebugTemplates.versionChecker.noLatestRelease(), owner, repo);
      return null;
    } catch (error) {
      logger.debug(DebugTemplates.versionChecker.latestReleaseError(), owner, repo, (error as Error).message);
      return null;
    }
  }

  async checkVersionStatus(
    currentVersion: string,
    latestVersion: string,
  ): Promise<VersionComparisonStatus> {
    const logger = this.logger.getSubLogger({ name: 'checkVersionStatus' });
    logger.debug(DebugTemplates.versionChecker.comparingVersions(), currentVersion, latestVersion);

    const cleanCurrentVersion = currentVersion.replace(/^v/, '');
    const cleanLatestVersion = latestVersion.replace(/^v/, '');

    if (!valid(cleanCurrentVersion)) {
      logger.debug(DebugTemplates.versionChecker.invalidConfiguredVersion(), cleanCurrentVersion);
      return VersionComparisonStatus.INVALID_CURRENT_VERSION;
    }
    if (!valid(cleanLatestVersion)) {
      logger.debug(DebugTemplates.versionChecker.invalidLatestVersion(), cleanLatestVersion);
      return VersionComparisonStatus.INVALID_LATEST_VERSION;
    }

    if (gt(cleanLatestVersion, cleanCurrentVersion)) {
      logger.debug(DebugTemplates.versionChecker.versionComparisonResult(), 'NEWER_AVAILABLE');
      return VersionComparisonStatus.NEWER_AVAILABLE;
    }
    if (eq(cleanLatestVersion, cleanCurrentVersion)) {
      logger.debug(DebugTemplates.versionChecker.versionComparisonResult(), 'UP_TO_DATE');
      return VersionComparisonStatus.UP_TO_DATE;
    }
    // This implies lt(cleanLatestVersion, cleanCurrentVersion)
    logger.debug(DebugTemplates.versionChecker.versionComparisonResult(), 'AHEAD_OF_LATEST');
    return VersionComparisonStatus.AHEAD_OF_LATEST;
  }
}
