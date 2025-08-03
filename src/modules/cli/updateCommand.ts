import { loadSingleToolConfig } from '@modules/config-loader';
import type { TsLogger } from '@modules/logger';
import { ErrorTemplates, WarningTemplates } from '@modules/shared/ErrorTemplates';
import { VersionComparisonStatus } from '@modules/version-checker';
import type { ToolConfig } from '@types';
import { type GlobalProgram, type Services } from '../../cli';
import { exitCli } from './exitCli';

export interface UpdateCommandOptions {
  yes?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export function registerUpdateCommand(
  parentLogger: TsLogger,
  program: GlobalProgram,
  servicesFactory: () => Promise<Services>,
): void {
  const logger = parentLogger.getSubLogger({ name: 'updateCommand' });
  program
    .command('update <toolName>')
    .description('Updates a specified tool to its latest version.')
    .option('-y, --yes', 'Automatically confirm updates', false)
    .action(async (toolName, options) => {
      const actionLogger = logger.getSubLogger({ name: 'action' });
      const combinedOptions = { ...options, ...program.opts() };
      actionLogger.debug(
        'Action called for tool "%s" with options: %o',
        toolName,
        combinedOptions,
      );

      const services = await servicesFactory();
      const { yamlConfig, fs, githubApiClient, installer, versionChecker } =
        services;

      try {
        actionLogger.debug('starting update process for tool=%s', toolName);
        let toolConfig: ToolConfig | undefined;
        try {
          toolConfig = await loadSingleToolConfig(
            actionLogger,
            toolName,
            yamlConfig.paths.toolConfigsDir,
            fs,
          );
          actionLogger.debug('loaded tool config for tool=%s', toolName);
        } catch (error) {
          actionLogger.debug(
            'error loading tool config for tool=%s, error=%s',
            toolName,
            (error as Error).message,
          );
          logger.error(ErrorTemplates.config.loadFailed(`tool "${toolName}"`, (error as Error).message));
          logger.debug('Error details: %O', error);
          exitCli(1);
        }

        if (!toolConfig) {
          actionLogger.debug('tool config not found for tool=%s', toolName);
          logger.error(ErrorTemplates.tool.notFound(toolName, yamlConfig.paths.toolConfigsDir));
          exitCli(1);
        }

        logger.info(`Checking for updates for "${toolName}"...`);

        if (toolConfig.installationMethod === 'github-release') {
          if (!toolConfig.installParams?.repo) {
            logger.warn(
              WarningTemplates.config.ignored('repo', `Tool "${toolName}" is 'github-release' but missing 'repo' parameter`)
            );
            return;
          }

          const [owner, repo] = toolConfig.installParams.repo.split('/');
          if (!owner || !repo) {
            logger.warn(
              WarningTemplates.config.invalid('repo format', toolConfig.installParams.repo, 'owner/repo')
            );
            return;
          }

          let latestRelease;
          try {
            latestRelease = await githubApiClient.getLatestRelease(owner, repo);
          } catch (networkError) {
            logger.error(ErrorTemplates.service.github.apiFailed('get latest release', 0, (networkError as Error).message));
            logger.debug('Error details: %O', networkError);
            return;
          }

          if (!latestRelease) {
            logger.warn(
              WarningTemplates.service.github.notFound('release', `${toolName} from ${owner}/${repo}`)
            );
            return;
          }

          const latestVersion = latestRelease.tag_name.replace(/^v/, ''); // Normalize tag
          const configuredVersion = toolConfig.version || 'latest';

          if (configuredVersion === 'latest') {
            logger.info(
              `Tool "${toolName}" is configured to 'latest'. Current latest is ${latestVersion}. To install this specific version, re-install or use update with a specific version target (not yet supported).`,
            );
            return;
          }

          const status = await versionChecker.checkVersionStatus(
            configuredVersion,
            latestVersion,
          );

          if (status === VersionComparisonStatus.NEWER_AVAILABLE) {
            logger.info(
              `Update available for ${toolName}: ${configuredVersion} -> ${latestVersion}.`,
            );
            logger.info(
              `Updating ${toolName} from ${configuredVersion} to ${latestVersion}...`,
            );

            const toolConfigForUpdate: ToolConfig = {
              ...toolConfig,
              version: latestVersion,
            };
            const installResult = await installer.install(
              toolName,
              toolConfigForUpdate,
              { force: true },
            );

            if (installResult.success) {
              logger.info(
                `${toolName} updated successfully to ${latestVersion}.`,
              );
              logger.debug(
                `Manifest update for ${toolName} to version ${latestVersion} would occur here.`,
              );
            } else {
              logger.error(ErrorTemplates.tool.updateFailed(toolName, installResult.error || 'Unknown error'));
              exitCli(1);
            }
          } else if (status === VersionComparisonStatus.UP_TO_DATE) {
            logger.info(
              `${toolName} (version ${configuredVersion}) is already up to date. Latest: ${latestVersion}.`,
            );
          } else if (
            status === VersionComparisonStatus.AHEAD_OF_LATEST ||
            status === VersionComparisonStatus.INVALID_CURRENT_VERSION ||
            status === VersionComparisonStatus.INVALID_LATEST_VERSION
          ) {
            logger.warn(
              WarningTemplates.tool.versionComparisonFailed(toolName, configuredVersion, latestVersion)
            );
          }
        } else {
          logger.info(
            `Update not yet supported for installation method: "${toolConfig.installationMethod}" for tool "${toolName}".`,
          );
        }
      } catch (error) {
        actionLogger.debug('Unhandled error in action handler: %O', error);
        if (
          error instanceof Error &&
          error.message.startsWith('MOCK_EXIT_CLI_CALLED_WITH_')
        ) {
          throw error;
        } else {
          logger.error(ErrorTemplates.command.executionFailed('update', 1, (error as Error).message));
          logger.debug('Error details: %O', error);
        }
        if (
          !(
            error instanceof Error &&
            error.message.startsWith('MOCK_EXIT_CLI_CALLED_WITH_')
          )
        ) {
          exitCli(1);
        }
      }
    });
}