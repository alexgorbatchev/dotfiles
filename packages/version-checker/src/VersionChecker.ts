import type { IGitHubApiClient } from '@dotfiles/installer/clients/github';
import type { TsLogger } from '@dotfiles/logger';
import { eq, gt, valid } from 'semver';
import type { IVersionChecker } from './IVersionChecker.ts';
import { VersionComparisonStatus } from './IVersionChecker.ts';
import { messages } from './log-messages';

export class VersionChecker implements IVersionChecker {
  private readonly githubClient: IGitHubApiClient;
  private readonly logger: TsLogger;

  constructor(parentLogger: TsLogger, githubClient: IGitHubApiClient) {
    this.logger = parentLogger.getSubLogger({ name: 'VersionChecker' });
    this.logger.debug(messages.initializing());
    this.githubClient = githubClient;
  }

  async getLatestToolVersion(owner: string, repo: string): Promise<string | null> {
    const logger = this.logger.getSubLogger({ name: 'getLatestToolVersion' });
    logger.debug(messages.fetchingLatestRelease(owner, repo));
    try {
      const release = await this.githubClient.getLatestRelease(owner, repo);
      if (release?.tag_name) {
        // Remove 'v' prefix if present, common in tags
        const version = release.tag_name.replace(/^v/, '');
        logger.debug(messages.latestReleaseFound(version));
        return version;
      }
      logger.debug(messages.noLatestRelease(owner, repo));
      return null;
    } catch (error) {
      logger.debug(messages.latestReleaseError(owner, repo), error);
      return null;
    }
  }

  async checkVersionStatus(currentVersion: string, latestVersion: string): Promise<VersionComparisonStatus> {
    const logger = this.logger.getSubLogger({ name: 'checkVersionStatus' });
    logger.debug(messages.comparingVersions(currentVersion, latestVersion));

    const cleanCurrentVersion = currentVersion.replace(/^v/, '');
    const cleanLatestVersion = latestVersion.replace(/^v/, '');

    if (!valid(cleanCurrentVersion)) {
      logger.debug(messages.invalidConfiguredVersion(cleanCurrentVersion));
      return VersionComparisonStatus.INVALID_CURRENT_VERSION;
    }
    if (!valid(cleanLatestVersion)) {
      logger.debug(messages.invalidLatestVersion(cleanLatestVersion));
      return VersionComparisonStatus.INVALID_LATEST_VERSION;
    }

    if (gt(cleanLatestVersion, cleanCurrentVersion)) {
      logger.debug(messages.versionComparisonResult('NEWER_AVAILABLE'));
      return VersionComparisonStatus.NEWER_AVAILABLE;
    }
    if (eq(cleanLatestVersion, cleanCurrentVersion)) {
      logger.debug(messages.versionComparisonResult('UP_TO_DATE'));
      return VersionComparisonStatus.UP_TO_DATE;
    }
    // This implies lt(cleanLatestVersion, cleanCurrentVersion)
    logger.debug(messages.versionComparisonResult('AHEAD_OF_LATEST'));
    return VersionComparisonStatus.AHEAD_OF_LATEST;
  }
}
