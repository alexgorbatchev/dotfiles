import { loadSingleToolConfig } from '@modules/config-loader';
import type { TsLogger } from '@modules/logger';
import { ErrorTemplates, WarningTemplates, SuccessTemplates, DebugTemplates } from '@modules/shared/ErrorTemplates';
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
        DebugTemplates.command.errorDetails(),
        toolName,
        combinedOptions,
      );

      const services = await servicesFactory();
      const { yamlConfig, fs, githubApiClient, installer, versionChecker } =
        services;

      try {
        actionLogger.debug(DebugTemplates.command.errorDetails(), toolName);
        let toolConfig: ToolConfig | undefined;
        try {
          toolConfig = await loadSingleToolConfig(
            actionLogger,
            toolName,
            yamlConfig.paths.toolConfigsDir,
            fs,
            yamlConfig,
          );
          actionLogger.debug(DebugTemplates.command.errorDetails(), toolName);
        } catch (error) {
          actionLogger.debug(
            DebugTemplates.command.errorDetails(),
            toolName,
            (error as Error).message,
          );
          logger.error(ErrorTemplates.config.loadFailed(`tool "${toolName}"`, (error as Error).message));
          logger.debug(DebugTemplates.command.errorDetails(), error);
          exitCli(1);
        }

        if (!toolConfig) {
          actionLogger.debug(DebugTemplates.command.errorDetails(), toolName);
          logger.error(ErrorTemplates.tool.notFound(toolName, yamlConfig.paths.toolConfigsDir));
          exitCli(1);
        }

        if (!combinedOptions.shimMode) {
          logger.info(SuccessTemplates.general.checkingUpdatesFor(toolName));
        }

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
            logger.debug(DebugTemplates.command.errorDetails(), networkError);
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
            if (combinedOptions.shimMode) {
              logger.info(SuccessTemplates.general.shimToolOnLatest(toolName, latestVersion));
            } else {
              logger.info(SuccessTemplates.general.toolOnLatest(toolName, latestVersion));
            }
            return;
          }

          const status = await versionChecker.checkVersionStatus(
            configuredVersion,
            latestVersion,
          );

          if (status === VersionComparisonStatus.NEWER_AVAILABLE) {
            if (combinedOptions.shimMode) {
              logger.info(SuccessTemplates.general.shimUpdateStarting(toolName, configuredVersion, latestVersion));
            } else {
              logger.info(SuccessTemplates.general.updateAvailable(toolName, configuredVersion, latestVersion));
              logger.info(SuccessTemplates.general.processingUpdate(toolName, configuredVersion, latestVersion));
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
                logger.info(SuccessTemplates.general.shimUpdateSuccess(toolName, latestVersion));
              } else {
                logger.info(
                  SuccessTemplates.tool.updated(toolName, configuredVersion, latestVersion),
                );
              }
              logger.debug(DebugTemplates.command.errorDetails());
            } else {
              logger.error(ErrorTemplates.tool.updateFailed(toolName, installResult.error || 'Unknown error'));
              exitCli(1);
            }
          } else if (status === VersionComparisonStatus.UP_TO_DATE) {
            if (combinedOptions.shimMode) {
              logger.info(SuccessTemplates.general.shimToolUpToDate(toolName, latestVersion));
            } else {
              logger.info(SuccessTemplates.general.toolUpToDate(toolName, configuredVersion, latestVersion));
            }
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
          logger.info(WarningTemplates.general.unsupportedOperation('Update', `installation method: "${toolConfig.installationMethod}" for tool "${toolName}"`));
        }
      } catch (error) {
        actionLogger.debug(DebugTemplates.command.errorDetails(), error);
        if (
          error instanceof Error &&
          error.message.startsWith('MOCK_EXIT_CLI_CALLED_WITH_')
        ) {
          throw error;
        } else {
          logger.error(ErrorTemplates.command.executionFailed('update', 1, (error as Error).message));
          logger.debug(DebugTemplates.command.errorDetails(), error);
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