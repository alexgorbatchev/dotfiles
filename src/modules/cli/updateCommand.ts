import type { AppConfig } from '@modules/config';
import { loadSingleToolConfig } from '@modules/config-loader/loadToolConfigs';
import type { IFileSystem } from '@modules/file-system';
import type { IGitHubApiClient } from '@modules/github-client';
import type { IInstaller } from '@modules/installer';
import { createClientLogger, createLogger as createDebugLoggerInternal } from '@modules/logger';
import type { IVersionChecker } from '@modules/version-checker';
import { VersionComparisonStatus } from '@modules/version-checker/IVersionChecker';
import type { GithubReleaseToolConfig, ToolConfig } from '@types';
import type { Command } from 'commander';
import type { ConsolaInstance } from 'consola';
import { setupServices } from '../../cli';
import { exitCli } from '../../exitCli';

const commandInternalLog = createDebugLoggerInternal('updateCommand');

export interface UpdateCommandOptions {
  yes?: boolean;
  verbose?: boolean; // Added for consistency, though not explicitly used in initial logic
  quiet?: boolean;   // Added for consistency
}

export interface UpdateCommandServices {
  appConfig: AppConfig;
  fileSystem: IFileSystem;
  githubApiClient: IGitHubApiClient;
  installerService: IInstaller;
  versionChecker: IVersionChecker;
  clientLogger: ConsolaInstance;
  loadSingleToolConfig: typeof loadSingleToolConfig; // For easier mocking in tests
}

async function updateActionLogic(
  toolName: string,
  options: UpdateCommandOptions,
  services: UpdateCommandServices
): Promise<void> {
  const {
    appConfig,
    fileSystem,
    githubApiClient,
    installerService,
    versionChecker,
    clientLogger: logger,
    loadSingleToolConfig: effectiveLoadSingleToolConfig, // Use the injected one
  } = services;

  logger.debug(`Update command logic started for tool "${toolName}" with options: %o`, options);

  let toolConfig: ToolConfig | undefined;
  try {
    toolConfig = await effectiveLoadSingleToolConfig(toolName, appConfig.toolConfigsDir, fileSystem);
  } catch (error) {
    logger.error(`Error loading configuration for tool "${toolName}": ${(error as Error).message}`);
    logger.debug('Error details: %O', error);
    exitCli(1); // Changed from return exitCli(1)
    return; // Ensure function exits if exitCli doesn't throw in some env
  }

  if (!toolConfig) {
    logger.error(`Tool configuration for "${toolName}" not found in ${appConfig.toolConfigsDir}.`);
    exitCli(1); // Changed from return exitCli(1)
    return; // Ensure function exits
  }

  logger.info(`Checking for updates for "${toolName}"...`);

  if (toolConfig.installationMethod === 'github-release') {
    const ghConfig = toolConfig as GithubReleaseToolConfig;
    if (!ghConfig.installParams?.repo) {
      logger.warn(`Tool "${toolName}" is 'github-release' but missing 'repo' in installParams. Cannot update.`);
      return;
    }

    const [owner, repo] = ghConfig.installParams.repo.split('/');
    if (!owner || !repo) {
      logger.warn(`Invalid 'repo' format for "${toolName}": ${ghConfig.installParams.repo}. Expected 'owner/repo'. Cannot update.`);
      return;
    }

    let latestRelease;
    try {
      latestRelease = await githubApiClient.getLatestRelease(owner, repo);
    } catch (networkError) {
      logger.error(`Error fetching latest release for ${toolName} from ${owner}/${repo}: ${(networkError as Error).message}`);
      logger.debug('Error details: %O', networkError);
      // Do not exitCli here, allow other tools to be processed if "update all" is implemented later
      return;
    }

    if (!latestRelease) {
      logger.warn(`Could not fetch latest release for "${toolName}" from ${owner}/${repo}.`);
      return;
    }
    
    const latestVersion = latestRelease.tag_name.replace(/^v/, ''); // Normalize tag
    const configuredVersion = toolConfig.version || 'latest';

    if (configuredVersion === 'latest') {
      logger.info(`Tool "${toolName}" is configured to 'latest'. Current latest is ${latestVersion}. To install this specific version, re-install or use update with a specific version target (not yet supported).`);
      return;
    }
    
    // Version checking and installation are outside the initial network try-catch
    // If versionChecker.checkVersionStatus itself could throw network errors, it might need its own try-catch
    // or be included in the one above if that's acceptable. For now, assuming it's CPU-bound after fetch.
    const status = await versionChecker.checkVersionStatus(configuredVersion, latestVersion);

    if (status === VersionComparisonStatus.NEWER_AVAILABLE) {
      logger.info(`Update available for ${toolName}: ${configuredVersion} -> ${latestVersion}.`);
      logger.info(`Updating ${toolName} from ${configuredVersion} to ${latestVersion}...`);

      const toolConfigForUpdate: ToolConfig = { ...toolConfig, version: latestVersion };
      const installResult = await installerService.install(toolName, toolConfigForUpdate, { force: true });

      if (installResult.success) {
        logger.success(`${toolName} updated successfully to ${latestVersion}.`);
        logger.debug(`Manifest update for ${toolName} to version ${latestVersion} would occur here.`);
      } else {
        logger.error(`Failed to update ${toolName}: ${installResult.error}`);
        exitCli(1); // This should now propagate up if it throws
        return;
      }
    } else if (status === VersionComparisonStatus.UP_TO_DATE) {
      logger.info(`${toolName} (version ${configuredVersion}) is already up to date. Latest: ${latestVersion}.`);
    } else if (status === VersionComparisonStatus.AHEAD_OF_LATEST || status === VersionComparisonStatus.INVALID_CURRENT_VERSION || status === VersionComparisonStatus.INVALID_LATEST_VERSION) {
      logger.warn(`${toolName} (version ${configuredVersion}) status is ${status} compared to latest (${latestVersion}). No action taken.`);
    }
  } else {
    logger.info(`Update not yet supported for installation method: "${toolConfig.installationMethod}" for tool "${toolName}".`);
  }
}

export function registerUpdateCommand(program: Command): void {
  program
    .command('update <toolName>')
    .description('Updates a specified tool to its latest version.')
    .option('-y, --yes', 'Automatically confirm updates', false)
    .option('--verbose', 'Enable detailed debug messages.', false) // Added for consistency
    .option('--quiet', 'Suppress all informational and debug output. Errors are still displayed.', false) // Added for consistency
    .action(async (toolName: string, options: UpdateCommandOptions) => {
      const clientLogger = createClientLogger(options);
      commandInternalLog('update command: Action called for tool "%s" with options: %o', toolName, options);
      try {
        const coreServices = await setupServices(); // dryRun is false by default
        const servicesForAction: UpdateCommandServices = {
          appConfig: coreServices.appConfig,
          fileSystem: coreServices.fs,
          githubApiClient: coreServices.githubApiClient,
          installerService: coreServices.installer,
          versionChecker: coreServices.versionChecker,
          clientLogger,
          loadSingleToolConfig: loadSingleToolConfig, // Pass the real function
        };

        await updateActionLogic(toolName, options, servicesForAction);
      } catch (error) {
        commandInternalLog('update command: Unhandled error in action handler: %O', error);
        
        if (error instanceof Error && error.message.startsWith('MOCK_EXIT_CLI_CALLED_WITH_')) {
          // This was an intentional exit from updateActionLogic (mocked to throw in tests).
          // Rethrow to allow test assertions on promise rejection.
          throw error;
        } else {
          // This is a genuinely unexpected error in the action handler.
          clientLogger.error('Critical error in update command: %s', (error as Error).message);
          clientLogger.debug('Error details: %O', error);
          exitCli(1); // Call exitCli for unhandled errors.
        }
      }
    });
}