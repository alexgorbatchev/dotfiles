import { loadSingleToolConfig, loadToolConfigsFromDirectory } from '@modules/config-loader';
import type { TsLogger } from '@modules/logger';
import { VersionComparisonStatus } from '@modules/version-checker';
import type { ToolConfig } from '@types';
import type { GlobalProgram, Services } from '../../cli';
import { exitCli } from './exitCli';
import { ErrorTemplates, WarningTemplates } from '@modules/shared/ErrorTemplates';

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
        logger.error(ErrorTemplates.tool.notFound(toolName, yamlConfig.paths.toolConfigsDir));
      }
    } else {
      toolConfigs = await loadToolConfigsFromDirectory(logger, yamlConfig.paths.toolConfigsDir, fs);
      if (Object.keys(toolConfigs).length === 0) {
        logger.info(`No tool configurations found in ${yamlConfig.paths.toolConfigsDir}.`);
        return;
      }
    }
  } catch (error) {
    logger.error(ErrorTemplates.config.loadFailed('tool configurations', (error as Error).message));
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
      if (!config.installParams.repo) {
        logger.warn(
          WarningTemplates.config.ignored('repo', `Tool "${config.name}" is 'github-release' but missing 'repo' parameter`)
        );
        continue;
      }
      const [owner, repoName] = config.installParams.repo.split('/');
      if (!owner || !repoName) {
        logger.warn(
          WarningTemplates.config.invalid('repo format', config.installParams.repo, 'owner/repo')
        );
        continue;
      }

      try {
        const latestRelease = await githubApiClient.getLatestRelease(owner, repoName);
        if (!latestRelease || !latestRelease.tag_name) {
          logger.warn(
            WarningTemplates.service.github.notFound('release', `${config.name} latest release`)
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
              WarningTemplates.tool.versionComparisonFailed(config.name, currentVersionToCompare, latestVersion)
            );
          }
        }
      } catch (error) {
        logger.error(ErrorTemplates.service.github.apiFailed('get latest release', 0, (error as Error).message));
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
        logger.error(ErrorTemplates.command.executionFailed('check-updates', 1, (error as Error).message));
        logger.debug('Error details: %O', error);
        exitCli(1);
      }
    });
}