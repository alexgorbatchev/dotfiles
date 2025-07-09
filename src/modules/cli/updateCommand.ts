import { loadSingleToolConfig } from '@modules/config-loader/loadToolConfigs';
import { createClientLogger, createLogger as createDebugLoggerInternal } from '@modules/logger';
import { VersionComparisonStatus } from '@modules/version-checker/IVersionChecker';
import type { GithubReleaseToolConfig, ToolConfig } from '@types';
import { type GlobalProgram, type Services } from '../../cli';
import { exitCli } from './exitCli';

const commandInternalLog = createDebugLoggerInternal('updateCommand');

export interface UpdateCommandOptions {
  yes?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export function registerUpdateCommand(
  program: GlobalProgram,
  services: Services,
): void {
  program
    .command('update <toolName>')
    .description('Updates a specified tool to its latest version.')
    .option('-y, --yes', 'Automatically confirm updates', false)
    .action(async (toolName, options) => {
      const combinedOptions = { ...options, ...program.opts() };
      const clientLogger = createClientLogger(combinedOptions);
      commandInternalLog('update command: Action called for tool "%s" with options: %o', toolName, combinedOptions);

      const { appConfig, fs, githubApiClient, installer, versionChecker } = services;

      try {
        let toolConfig: ToolConfig | undefined;
        try {
          toolConfig = await loadSingleToolConfig(toolName, appConfig.toolConfigsDir, fs);
        } catch (error) {
          clientLogger.error(`Error loading configuration for tool "${toolName}": ${(error as Error).message}`);
          clientLogger.debug('Error details: %O', error);
          exitCli(1);
          return; // Should be unreachable
        }

        if (!toolConfig) {
          clientLogger.error(`Tool configuration for "${toolName}" not found in ${appConfig.toolConfigsDir}.`);
          exitCli(1);
        }

        clientLogger.info(`Checking for updates for "${toolName}"...`);

        if (toolConfig.installationMethod === 'github-release') {
          const ghConfig = toolConfig as GithubReleaseToolConfig;
          if (!ghConfig.installParams?.repo) {
            clientLogger.warn(`Tool "${toolName}" is 'github-release' but missing 'repo' in installParams. Cannot update.`);
            return;
          }

          const [owner, repo] = ghConfig.installParams.repo.split('/');
          if (!owner || !repo) {
            clientLogger.warn(`Invalid 'repo' format for "${toolName}": ${ghConfig.installParams.repo}. Expected 'owner/repo'. Cannot update.`);
            return;
          }

          let latestRelease;
          try {
            latestRelease = await githubApiClient.getLatestRelease(owner, repo);
          } catch (networkError) {
            clientLogger.error(`Error fetching latest release for ${toolName} from ${owner}/${repo}: ${(networkError as Error).message}`);
            clientLogger.debug('Error details: %O', networkError);
            return;
          }

          if (!latestRelease) {
            clientLogger.warn(`Could not fetch latest release for "${toolName}" from ${owner}/${repo}.`);
            return;
          }

          const latestVersion = latestRelease.tag_name.replace(/^v/, ''); // Normalize tag
          const configuredVersion = toolConfig.version || 'latest';

          if (configuredVersion === 'latest') {
            clientLogger.info(`Tool "${toolName}" is configured to 'latest'. Current latest is ${latestVersion}. To install this specific version, re-install or use update with a specific version target (not yet supported).`);
            return;
          }

          const status = await versionChecker.checkVersionStatus(configuredVersion, latestVersion);

          if (status === VersionComparisonStatus.NEWER_AVAILABLE) {
            clientLogger.info(`Update available for ${toolName}: ${configuredVersion} -> ${latestVersion}.`);
            clientLogger.info(`Updating ${toolName} from ${configuredVersion} to ${latestVersion}...`);

            const toolConfigForUpdate: ToolConfig = { ...toolConfig, version: latestVersion };
            const installResult = await installer.install(toolName, toolConfigForUpdate, { force: true });

            if (installResult.success) {
              clientLogger.success(`${toolName} updated successfully to ${latestVersion}.`);
              clientLogger.debug(`Manifest update for ${toolName} to version ${latestVersion} would occur here.`);
            } else {
              clientLogger.error(`Failed to update ${toolName}: ${installResult.error}`);
              exitCli(1);
              return; // Should be unreachable
            }
          } else if (status === VersionComparisonStatus.UP_TO_DATE) {
            clientLogger.info(`${toolName} (version ${configuredVersion}) is already up to date. Latest: ${latestVersion}.`);
          } else if (status === VersionComparisonStatus.AHEAD_OF_LATEST || status === VersionComparisonStatus.INVALID_CURRENT_VERSION || status === VersionComparisonStatus.INVALID_LATEST_VERSION) {
            clientLogger.warn(`${toolName} (version ${configuredVersion}) status is ${status} compared to latest (${latestVersion}). No action taken.`);
          }
        } else {
          clientLogger.info(`Update not yet supported for installation method: "${toolConfig.installationMethod}" for tool "${toolName}".`);
        }
      } catch (error) {
        commandInternalLog('update command: Unhandled error in action handler: %O', error);
        if (error instanceof Error && error.message.startsWith('MOCK_EXIT_CLI_CALLED_WITH_')) {
          throw error;
        } else {
          clientLogger.error('Critical error in update command: %s', (error as Error).message);
          clientLogger.debug('Error details: %O', error);
        }
        if (!(error instanceof Error && error.message.startsWith('MOCK_EXIT_CLI_CALLED_WITH_'))) {
          exitCli(1);
        }
      }
    });
}