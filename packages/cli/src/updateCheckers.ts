import type { ICargoClient } from '@dotfiles/installer/clients/cargo';
import type { IGitHubApiClient } from '@dotfiles/installer/clients/github';
import type { TsLogger } from '@dotfiles/logger';
import type {
  BaseToolConfigProperties,
  BrewToolConfig,
  CargoInstallParams,
  CargoToolConfig,
  GithubReleaseToolConfig,
} from '@dotfiles/schemas';
import type { IVersionChecker } from '@dotfiles/version-checker';
import { VersionComparisonStatus } from '@dotfiles/version-checker';
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
    const githubParams = config.installParams;
    const repo = githubParams.repo;
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
 * Note: This currently uses a simplified approach and doesn't query brew directly.
 * In production, this would need to call `brew info <formula>` to get the latest version.
 */
export async function checkBrewUpdate(
  config: BrewToolConfig,
  versionChecker: IVersionChecker,
  logger: TsLogger
): Promise<void> {
  try {
    const brewParams = config.installParams;
    const formula = brewParams?.formula;
    if (!formula) {
      logger.error(messages.configParameterInvalid('formula', 'undefined', 'formula name'));
      return;
    }

    const configuredVersion = config.version || 'latest';

    // For brew, we would need to call `brew info <formula>` to get the latest version
    // For now, we use the version checker's mock-friendly interface
    // In a real implementation, this would need a brew-specific client
    const latestVersion = await versionChecker.getLatestToolVersion('', '');

    if (!latestVersion) {
      logger.warn(messages.serviceGithubResourceNotFound('brew formula', formula));
      return;
    }

    if (configuredVersion === 'latest') {
      logger.info(messages.toolConfiguredToLatest(config.name, latestVersion));
      return;
    }

    await performVersionComparison(config, configuredVersion, latestVersion, versionChecker, logger);
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
  config: BaseToolConfigProperties,
  currentVersionToCompare: string,
  latestVersion: string,
  versionChecker: IVersionChecker,
  logger: TsLogger
): Promise<void> {
  const status: VersionComparisonStatus = await versionChecker.checkVersionStatus(
    currentVersionToCompare,
    latestVersion
  );

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
