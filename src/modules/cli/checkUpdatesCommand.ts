import { loadSingleToolConfig, loadToolConfigsFromDirectory } from '@modules/config-loader';
import type { TsLogger } from '@modules/logger';
import { VersionComparisonStatus } from '@modules/version-checker';
import type { GithubReleaseToolConfig, ToolConfig } from '@types';
import type { GlobalProgram, Services } from '../../cli';
import { exitCli } from './exitCli';

export interface CheckUpdatesCommandOptions {
  verbose?: boolean;
  quiet?: boolean;
}

export async function checkUpdatesActionLogic(
  parentLogger: TsLogger,
  toolName: string | undefined,
  services: Services,
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'checkUpdatesActionLogic' });
  const { yamlConfig, fs, versionChecker, githubApiClient } = services;

  logger.debug(
    'Check-updates command action logic started. Tool: %s',
    toolName || 'all',
  );

  let toolConfigs: Record<string, ToolConfig> = {};
  let specificToolNotFound = false;

  try {
    if (toolName) {
      const config = await loadSingleToolConfig(logger, toolName, yamlConfig.paths.toolConfigsDir, fs);
      if (config) {
        toolConfigs[toolName] = config;
      } else {
        specificToolNotFound = true;
        logger.error(
          `Tool configuration for "${toolName}" not found in ${yamlConfig.paths.toolConfigsDir}.`,
        );
      }
    } else {
      toolConfigs = await loadToolConfigsFromDirectory(logger, yamlConfig.paths.toolConfigsDir, fs);
      if (Object.keys(toolConfigs).length === 0) {
        logger.info(`No tool configurations found in ${yamlConfig.paths.toolConfigsDir}.`);
        return;
      }
    }
  } catch (error) {
    logger.error('Error loading tool configurations: %s', (error as Error).message);
    logger.debug('Configuration loading error details: %O', error);
    exitCli(1);
    return;
  }

  if (specificToolNotFound) {
    exitCli(1);
    return;
  }

  for (const config of Object.values(toolConfigs)) {
    logger.info(`Checking updates for: ${config.name}`);
    const configuredVersion = config.version || 'latest';

    if (config.installationMethod === 'github-release') {
      const ghConfig = config as GithubReleaseToolConfig;
      if (!ghConfig.installParams.repo) {
        logger.warn(
          `Tool "${config.name}" is 'github-release' but missing 'repo' in installParams. Skipping.`,
        );
        continue;
      }
      const [owner, repoName] = ghConfig.installParams.repo.split('/');
      if (!owner || !repoName) {
        logger.warn(
          `Invalid 'repo' format for "${config.name}": ${ghConfig.installParams.repo}. Expected 'owner/repo'. Skipping.`,
        );
        continue;
      }

      try {
        const latestRelease = await githubApiClient.getLatestRelease(owner, repoName);
        if (!latestRelease || !latestRelease.tag_name) {
          logger.warn(
            `Could not fetch latest release information for ${config.name} from GitHub.`,
          );
          continue;
        }
        const latestVersion = latestRelease.tag_name.replace(/^v/, ''); // Remove 'v' prefix if present

        logger.debug(
          `Tool: ${config.name}, Configured: ${configuredVersion}, Latest: ${latestVersion}`,
        );

        if (configuredVersion.toLowerCase() === 'latest') {
          logger.info(
            `Tool "${config.name}" is configured to 'latest'. The latest available version is ${latestVersion}.`,
          );
        } else {
          const currentVersionToCompare = configuredVersion.replace(/^v/, '');
          const status = await versionChecker.checkVersionStatus(
            currentVersionToCompare,
            latestVersion,
          );

          if (status === VersionComparisonStatus.NEWER_AVAILABLE) {
            logger.info(
              `Update available for ${config.name}: ${currentVersionToCompare} -> ${latestVersion}`,
            );
          } else if (status === VersionComparisonStatus.UP_TO_DATE) {
            logger.info(
              `${config.name} (${currentVersionToCompare}) is up to date. Latest: ${latestVersion}`,
            );
          } else if (status === VersionComparisonStatus.AHEAD_OF_LATEST) {
            logger.info(
              `${config.name} (${currentVersionToCompare}) is ahead of the latest known version (${latestVersion}).`,
            );
          } else {
            logger.warn(
              `Could not determine update status for ${config.name} (${currentVersionToCompare}) against latest ${latestVersion}. Status: ${status}`,
            );
          }
        }
      } catch (error) {
        logger.error(
          `Error checking GitHub updates for ${config.name}: ${(error as Error).message}`,
        );
        logger.debug('GitHub API error details for %s: %O', config.name, error);
      }
    } else {
      logger.info(
        `Update checking not yet supported for ${config.name} (method: ${config.installationMethod})`,
      );
    }
  }
  logger.info('Check-updates command finished.');
}

export function registerCheckUpdatesCommand(
  parentLogger: TsLogger,
  program: GlobalProgram,
  services: Services,
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerCheckUpdatesCommand' });
  program
    .command('check-updates [toolName]')
    .description(
      'Checks for available updates for configured tools. If [toolName] is provided, checks only that tool.',
    )
    .action(async (toolName, options) => {
      const combinedOptions = { ...options, ...program.opts() };

      logger.debug(
        'check-updates command: Action called for tool "%s" with options: %o',
        toolName || 'all',
        combinedOptions,
      );
      try {
        await checkUpdatesActionLogic(logger, toolName, services);
      } catch (error) {
        logger.debug('check-updates command: Unhandled error in action handler: %O', error);
        logger.error('Failed to execute command: %s', (error as Error).message);
        logger.debug('Error details: %O', error);
        exitCli(1);
      }
    });
}