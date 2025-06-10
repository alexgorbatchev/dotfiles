/**
 * @file generator/src/modules/cli/checkUpdatesCommand.ts
 * @description CLI command for checking available updates for configured tools.
 */

import type { Command } from 'commander';
import type { AppConfig } from '@modules/config';
import type { IFileSystem } from '@modules/file-system';
import type { IVersionChecker } from '@modules/version-checker';
import { VersionComparisonStatus } from '@modules/version-checker/IVersionChecker'; // Added import
import type { IGitHubApiClient } from '@modules/github-client';
import type { ConsolaInstance } from 'consola';
import { loadToolConfigsFromDirectory, loadSingleToolConfig } from '@modules/config-loader/loadToolConfigs';
import type { GithubReleaseToolConfig, ToolConfig } from '@types';
import { createClientLogger } from '@modules/logger';
import { setupServices } from '../../cli'; // Import setupServices
import { exitCli } from '../../exitCli'; // Added

export interface CheckUpdatesCommandOptions {
  verbose?: boolean;
  quiet?: boolean;
  // toolName is an argument, not an option here
}

export interface CheckUpdatesCommandServices {
  appConfig: AppConfig;
  fileSystem: IFileSystem;
  versionChecker: IVersionChecker;
  githubApiClient: IGitHubApiClient;
  clientLogger: ConsolaInstance;
}

export async function checkUpdatesActionLogic( // Export the function
  toolName: string | undefined,
  options: CheckUpdatesCommandOptions,
  services: CheckUpdatesCommandServices
): Promise<void> {
  const { appConfig, fileSystem, versionChecker, githubApiClient, clientLogger } = services;

  clientLogger.debug('Check-updates command action logic started. Tool: %s, Options: %o', toolName || 'all', options);

  let toolConfigs: Record<string, ToolConfig> = {};
  let specificToolNotFound = false;

  try {
    if (toolName) {
      const config = await loadSingleToolConfig(toolName, appConfig.toolConfigsDir, fileSystem);
      if (config) {
        toolConfigs[toolName] = config;
      } else {
        specificToolNotFound = true;
        clientLogger.error(`Tool configuration for "${toolName}" not found in ${appConfig.toolConfigsDir}.`);
      }
    } else {
      toolConfigs = await loadToolConfigsFromDirectory(appConfig.toolConfigsDir, fileSystem);
      if (Object.keys(toolConfigs).length === 0) {
        clientLogger.info(`No tool configurations found in ${appConfig.toolConfigsDir}.`);
        return;
      }
    }
  } catch (error) {
    clientLogger.error('Error loading tool configurations: %s', (error as Error).message);
    clientLogger.debug('Configuration loading error details: %O', error);
    exitCli(1);
    return;
  }

  if (specificToolNotFound) {
    exitCli(1);
    return;
  }

  for (const config of Object.values(toolConfigs)) {
    clientLogger.info(`Checking updates for: ${config.name}`);
    const configuredVersion = config.version || 'latest';

    if (config.installationMethod === 'github-release') {
      const ghConfig = config as GithubReleaseToolConfig;
      if (!ghConfig.installParams.repo) {
        clientLogger.warn(`Tool "${config.name}" is 'github-release' but missing 'repo' in installParams. Skipping.`);
        continue;
      }
      const [owner, repoName] = ghConfig.installParams.repo.split('/');
      if (!owner || !repoName) {
        clientLogger.warn(`Invalid 'repo' format for "${config.name}": ${ghConfig.installParams.repo}. Expected 'owner/repo'. Skipping.`);
        continue;
      }

      try {
        const latestRelease = await githubApiClient.getLatestRelease(owner, repoName);
        if (!latestRelease || !latestRelease.tag_name) {
          clientLogger.warn(`Could not fetch latest release information for ${config.name} from GitHub.`);
          continue;
        }
        const latestVersion = latestRelease.tag_name.replace(/^v/, ''); // Remove 'v' prefix if present

        clientLogger.debug(`Tool: ${config.name}, Configured: ${configuredVersion}, Latest: ${latestVersion}`);

        if (configuredVersion.toLowerCase() === 'latest') {
          // If configured is 'latest', we can't directly compare.
          // For now, we'll assume 'latest' means they want the newest.
          // A more robust check might involve checking an installed version from a manifest.
          // As per scope, we check configured vs latest. If configured is 'latest', it's effectively up-to-date with its own setting.
          // However, it's more useful to show what 'latest' resolves to.
          clientLogger.log(`Tool "${config.name}" is configured to 'latest'. The latest available version is ${latestVersion}.`);
        } else {
          const currentVersionToCompare = configuredVersion.replace(/^v/, '');
          const status = await versionChecker.checkVersionStatus(currentVersionToCompare, latestVersion);

          if (status === VersionComparisonStatus.NEWER_AVAILABLE) {
            clientLogger.log(`Update available for ${config.name}: ${currentVersionToCompare} -> ${latestVersion}`);
          } else if (status === VersionComparisonStatus.UP_TO_DATE) {
            clientLogger.log(`${config.name} (${currentVersionToCompare}) is up to date. Latest: ${latestVersion}`);
          } else if (status === VersionComparisonStatus.AHEAD_OF_LATEST) {
            clientLogger.log(`${config.name} (${currentVersionToCompare}) is ahead of the latest known version (${latestVersion}).`);
          } else {
            clientLogger.warn(`Could not determine update status for ${config.name} (${currentVersionToCompare}) against latest ${latestVersion}. Status: ${status}`);
          }
        }
      } catch (error) {
        clientLogger.error(`Error checking GitHub updates for ${config.name}: ${(error as Error).message}`);
        clientLogger.debug('GitHub API error details for %s: %O', config.name, error);
      }
    } else {
      clientLogger.log(`Update checking not yet supported for ${config.name} (method: ${config.installationMethod})`);
    }
  }
  clientLogger.info('Check-updates command finished.');
}

// This function will be imported and called in cli.ts
export function registerCheckUpdatesCommand(program: Command) {
  program
    .command('check-updates [toolName]')
    .description('Checks for available updates for configured tools. If [toolName] is provided, checks only that tool.')
    .option('--verbose', 'Enable detailed debug messages.', false)
    .option('--quiet', 'Suppress all informational and debug output. Errors are still displayed.', false)
    .action(async (toolName: string | undefined, options: CheckUpdatesCommandOptions) => {
      const clientLogger = createClientLogger(options);
      try {
        // Setup services inside the action handler
        const coreServices = await setupServices(); // setupServices doesn't take dryRun for check-updates
        
        const servicesForAction: CheckUpdatesCommandServices = {
          appConfig: coreServices.appConfig,
          fileSystem: coreServices.fs, // map fs to fileSystem
          versionChecker: coreServices.versionChecker,
          githubApiClient: coreServices.githubApiClient,
          clientLogger,
        };
        // Directly call the exported action logic function
        await checkUpdatesActionLogic(toolName, options, servicesForAction);
      } catch (error) {
        clientLogger.error('Failed to setup services or execute command: %s', (error as Error).message);
        clientLogger.debug('Error details: %O', error);
        exitCli(1); // Ensure exit code is set on setup failure
      }
    });
}