import { loadSingleToolConfig } from '@modules/config-loader';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import { VersionComparisonStatus } from '@modules/version-checker';
import type { ToolConfig } from '@types';
import { type GlobalProgram, type Services } from '../../cli';
import { exitCli } from './exitCli';

export interface UpdateCommandOptions {
  yes?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  shimMode?: boolean;
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
    .option('--shim-mode', 'Run in shim mode with minimal output', false)
    .action(async (toolName, options) => {
      const actionLogger = logger.getSubLogger({ name: 'action' });
      const combinedOptions = { ...options, ...program.opts() };
      actionLogger.debug(
        logs.command.debug.errorDetails(),
        toolName,
        combinedOptions,
      );

      const services = await servicesFactory();
      const { yamlConfig, fs, githubApiClient, installer, versionChecker } =
        services;

      try {
        actionLogger.debug(logs.command.debug.errorDetails(), toolName);
        let toolConfig: ToolConfig | undefined;
        try {
          toolConfig = await loadSingleToolConfig(
            actionLogger,
            toolName,
            yamlConfig.paths.toolConfigsDir,
            fs,
            yamlConfig,
          );
          actionLogger.debug(logs.command.debug.errorDetails(), toolName);
        } catch (error) {
          actionLogger.debug(
            logs.command.debug.errorDetails(),
            toolName,
            (error as Error).message,
          );
          logger.error(logs.config.error.loadFailed(`tool "${toolName}"`, (error as Error).message));
          logger.debug(logs.command.debug.errorDetails(), error);
          exitCli(1);
        }

        if (!toolConfig) {
          actionLogger.debug(logs.command.debug.errorDetails(), toolName);
          logger.error(logs.tool.error.notFound(toolName, yamlConfig.paths.toolConfigsDir));
          exitCli(1);
        }

        if (!combinedOptions.shimMode) {
          logger.info(logs.general.success.checkingUpdatesFor(toolName));
        }

        if (toolConfig.installationMethod === 'github-release') {
          if (!toolConfig.installParams?.repo) {
            logger.warn(
              logs.config.warning.ignored('repo', `Tool "${toolName}" is 'github-release' but missing 'repo' parameter`)
            );
            return;
          }

          const [owner, repo] = toolConfig.installParams.repo.split('/');
          if (!owner || !repo) {
            logger.warn(
              logs.config.warning.invalid('repo format', toolConfig.installParams.repo, 'owner/repo')
            );
            return;
          }

          let latestRelease;
          try {
            latestRelease = await githubApiClient.getLatestRelease(owner, repo);
          } catch (networkError) {
            logger.error(logs.service.error.github.apiFailed('get latest release', 0, (networkError as Error).message));
            logger.debug(logs.command.debug.errorDetails(), networkError);
            return;
          }

          if (!latestRelease) {
            logger.warn(
              logs.service.warning.github.notFound('release', `${toolName} from ${owner}/${repo}`)
            );
            return;
          }

          const latestVersion = latestRelease.tag_name.replace(/^v/, ''); // Normalize tag
          const configuredVersion = toolConfig.version || 'latest';

          if (configuredVersion === 'latest') {
            if (combinedOptions.shimMode) {
              logger.info(logs.general.success.shimToolOnLatest(toolName, latestVersion));
            } else {
              logger.info(logs.general.success.toolOnLatest(toolName, latestVersion));
            }
            return;
          }

          const status = await versionChecker.checkVersionStatus(
            configuredVersion,
            latestVersion,
          );

          if (status === VersionComparisonStatus.NEWER_AVAILABLE) {
            if (combinedOptions.shimMode) {
              logger.info(logs.general.success.shimUpdateStarting(toolName, configuredVersion, latestVersion));
            } else {
              logger.info(logs.general.success.updateAvailable(toolName, configuredVersion, latestVersion));
              logger.info(logs.general.success.processingUpdate(toolName, configuredVersion, latestVersion));
            }

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
              if (combinedOptions.shimMode) {
                logger.info(logs.general.success.shimUpdateSuccess(toolName, latestVersion));
              } else {
                logger.info(
                  logs.tool.success.updated(toolName, configuredVersion, latestVersion),
                );
              }
              logger.debug(logs.command.debug.errorDetails());
            } else {
              logger.error(logs.tool.error.updateFailed(toolName, installResult.error || 'Unknown error'));
              exitCli(1);
            }
          } else if (status === VersionComparisonStatus.UP_TO_DATE) {
            if (combinedOptions.shimMode) {
              logger.info(logs.general.success.shimToolUpToDate(toolName, latestVersion));
            } else {
              logger.info(logs.general.success.toolUpToDate(toolName, configuredVersion, latestVersion));
            }
          } else if (
            status === VersionComparisonStatus.AHEAD_OF_LATEST ||
            status === VersionComparisonStatus.INVALID_CURRENT_VERSION ||
            status === VersionComparisonStatus.INVALID_LATEST_VERSION
          ) {
            logger.warn(
              logs.tool.warning.versionComparisonFailed(toolName, configuredVersion, latestVersion)
            );
          }
        } else {
          logger.info(logs.general.warning.unsupportedOperation('Update', `installation method: "${toolConfig.installationMethod}" for tool "${toolName}"`));
        }
      } catch (error) {
        actionLogger.debug(logs.command.debug.errorDetails(), error);
        if (
          error instanceof Error &&
          error.message.startsWith('MOCK_EXIT_CLI_CALLED_WITH_')
        ) {
          throw error;
        } else {
          logger.error(logs.command.error.executionFailed('update', 1, (error as Error).message));
          logger.debug(logs.command.debug.errorDetails(), error);
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