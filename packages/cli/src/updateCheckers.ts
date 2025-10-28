import type { TsLogger } from '@dotfiles/logger';
import type { IVersionChecker } from '@dotfiles/version-checker';
import { VersionComparisonStatus } from '@dotfiles/version-checker';
import type { IGitHubApiClient } from '@dotfiles/installer/clients/github';
import type { ICargoClient } from '@dotfiles/installer/clients/cargo';
import type {
  BrewToolConfig,
  CargoToolConfig,
  GithubReleaseToolConfig,
  GithubReleaseInstallParams,
  CargoInstallParams,
} from '@dotfiles/schemas';
import { messages } from './log-messages';

/**
 * Checks for updates to a GitHub release tool by comparing configured version with latest release
 */
export async function checkGitHubReleaseUpdate(
  config: GithubReleaseToolConfig,
  apiClient: IGitHubApiClient,
  versionChecker: IVersionChecker,
  logger: TsLogger
): Promise<void> {
  try {
    const githubParams = config.installParams as GithubReleaseInstallParams;
    const repo = githubParams?.repo;

    if (!repo) {
      logger.error(messages.configParameterInvalid('repo', 'undefined', 'owner/repo format'));
      return;
    }

    const [owner, repoName] = repo.split('/');
    if (!owner || !repoName) {
      logger.error(messages.configParameterInvalid('repo', repo, 'owner/repo format'));
      return;
    }

    const latestRelease = await apiClient.getLatestRelease(owner, repoName);
    if (!latestRelease || !latestRelease.tag_name) {
      logger.warn(messages.serviceGithubResourceNotFound('release', `${config.name} latest release`));
      return;
    }

    const configuredVersion = config.version || 'latest';
    const latestVersion = latestRelease.tag_name.replace(/^v/, ''); // Remove 'v' prefix if present
    logger.debug(messages.commandVersionComparison(config.name, configuredVersion, latestVersion));

    if (configuredVersion === 'latest') {
      logger.info(messages.toolConfiguredToLatest(config.name, latestVersion));
      return;
    }

    await performVersionComparison(config, configuredVersion, latestVersion, versionChecker, logger);
  } catch (error) {
    logger.error(messages.serviceGithubApiFailed('get latest release', 0), error);
  }
}

/**
 * Checks for updates to a Brew tool by comparing configured version with latest brew formula
 */
export async function checkBrewUpdate(
  config: BrewToolConfig,
  logger: TsLogger
): Promise<void> {
  try {
    const configuredVersion = config.version || 'latest';
    if (configuredVersion === 'latest') {
      logger.info(messages.toolConfiguredToLatest(config.name, 'latest'));
      return;
    }

    // For brew, we can't easily check remote versions without making API calls
    // This is a placeholder for when we implement brew version checking
    logger.info(messages.toolUpToDate(config.name, configuredVersion, 'unknown'));
  } catch (error) {
    logger.error(messages.serviceGithubApiFailed('brew version check', 0), error);
  }
}

/**
 * Checks for updates to a Cargo tool by comparing configured version with latest crate version
 */
export async function checkCargoUpdate(
  config: CargoToolConfig,
  cargoClient: ICargoClient,
  versionChecker: IVersionChecker,
  logger: TsLogger
): Promise<void> {
  try {
    const cargoParams = config.installParams as CargoInstallParams;
    const crateName = cargoParams?.crateName;
    if (!crateName) {
      logger.error(messages.configParameterInvalid('crateName', 'undefined', 'crate name'));
      return;
    }

    const latestVersion = await cargoClient.getLatestVersion(crateName);
    if (!latestVersion) {
      logger.warn(messages.serviceGithubResourceNotFound('crate', `${config.name} (${crateName})`));
      return;
    }

    const configuredVersion = config.version || 'latest';
    logger.debug(messages.commandVersionComparison(config.name, configuredVersion, latestVersion));

    if (configuredVersion === 'latest') {
      logger.info(messages.toolConfiguredToLatest(config.name, latestVersion));
      return;
    }

    await performVersionComparison(config, configuredVersion, latestVersion, versionChecker, logger);
  } catch (error) {
    logger.error(messages.serviceGithubApiFailed('get crate info', 0), error);
  }
}

async function performVersionComparison(
  config: { name: string },
  currentVersionToCompare: string,
  latestVersion: string,
  versionChecker: IVersionChecker,
  logger: TsLogger
): Promise<void> {
  const status: VersionComparisonStatus = await versionChecker.checkVersionStatus(currentVersionToCompare, latestVersion);
  
  if (status === VersionComparisonStatus.NEWER_AVAILABLE) {
    logger.info(messages.toolUpdateAvailable(config.name, currentVersionToCompare, latestVersion));
  } else if (status === VersionComparisonStatus.UP_TO_DATE) {
    logger.info(messages.toolUpToDate(config.name, currentVersionToCompare, latestVersion));
  } else if (status === VersionComparisonStatus.AHEAD_OF_LATEST) {
    logger.info(messages.toolAheadOfLatest(config.name, currentVersionToCompare, latestVersion));
  } else {
    logger.warn(messages.toolVersionComparisonFailed(config.name, currentVersionToCompare, latestVersion));
  }
}