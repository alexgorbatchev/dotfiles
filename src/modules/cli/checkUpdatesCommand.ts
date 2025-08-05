import { loadSingleToolConfig, loadToolConfigsFromDirectory } from '@modules/config-loader';
import type { TsLogger } from '@modules/logger';
import { VersionComparisonStatus } from '@modules/version-checker';
import type { ToolConfig } from '@types';
import type { GlobalProgram, Services } from '../../cli';
import { exitCli } from './exitCli';
import { ErrorTemplates, WarningTemplates, SuccessTemplates, DebugTemplates } from '@modules/shared/ErrorTemplates';

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

  logger.trace(DebugTemplates.command.actionStarted('check-updates', toolName || 'all'));

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
        logger.info(SuccessTemplates.general.noToolsFound(yamlConfig.paths.toolConfigsDir));
        return;
      }
    }
  } catch (error) {
    logger.error(ErrorTemplates.config.loadFailed('tool configurations', (error as Error).message));
    logger.debug(DebugTemplates.command.configErrorDetails(), error);
    exitCli(1);
    return;
  }

  if (specificToolNotFound) {
    exitCli(1);
    return;
  }

  for (const config of Object.values(toolConfigs)) {
    logger.info(SuccessTemplates.general.checkingUpdates(config.name));
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

        logger.debug(DebugTemplates.command.versionComparisonDebug(config.name, configuredVersion, latestVersion));

        if (configuredVersion.toLowerCase() === 'latest') {
          logger.info(SuccessTemplates.general.toolOnLatest(config.name, latestVersion));
        } else {
          const currentVersionToCompare = configuredVersion.replace(/^v/, '');
          const status = await versionChecker.checkVersionStatus(
            currentVersionToCompare,
            latestVersion,
          );

          if (status === VersionComparisonStatus.NEWER_AVAILABLE) {
            logger.info(SuccessTemplates.general.updateAvailable(config.name, currentVersionToCompare, latestVersion));
          } else if (status === VersionComparisonStatus.UP_TO_DATE) {
            logger.info(SuccessTemplates.general.toolUpToDate(config.name, currentVersionToCompare, latestVersion));
          } else if (status === VersionComparisonStatus.AHEAD_OF_LATEST) {
            logger.info(SuccessTemplates.general.toolAhead(config.name, currentVersionToCompare, latestVersion));
          } else {
            logger.warn(
              WarningTemplates.tool.versionComparisonFailed(config.name, currentVersionToCompare, latestVersion)
            );
          }
        }
      } catch (error) {
        logger.error(ErrorTemplates.service.github.apiFailed('get latest release', 0, (error as Error).message));
        logger.debug(DebugTemplates.command.githubApiError(config.name), error);
      }
    } else {
      logger.warn(WarningTemplates.general.unsupportedOperation(`Update checking for ${config.name}`, `method: ${config.installationMethod}`));
    }
  }
  logger.info(SuccessTemplates.general.completed('Check-updates command'));
}

export function registerCheckUpdatesCommand(
  parentLogger: TsLogger,
  program: GlobalProgram,
  servicesFactory: () => Promise<Services>,
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerCheckUpdatesCommand' });
  program
    .command('check-updates [toolName]')
    .description(
      'Checks for available updates for configured tools. If [toolName] is provided, checks only that tool.',
    )
    .action(async (toolName, options) => {
      const combinedOptions = { ...options, ...program.opts() };

      logger.debug(DebugTemplates.command.actionCalled('check-updates', toolName || 'all'), combinedOptions);
      try {
        const services = await servicesFactory();
        await checkUpdatesActionLogic(logger, toolName, services);
      } catch (error) {
        logger.debug(DebugTemplates.command.unhandledError(), error);
        logger.error(ErrorTemplates.command.executionFailed('check-updates', 1, (error as Error).message));
        logger.debug(DebugTemplates.command.errorDetails(), error);
        exitCli(1);
      }
    });
}