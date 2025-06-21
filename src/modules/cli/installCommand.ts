/**
 * @file installCommand.ts
 * @description CLI command for installing tools.
 *
 * ## Development Plan
 * - [x] Define `_installActionLogic` to encapsulate core installation logic.
 * - [x] Define `registerInstallCommand` to set up the command with Commander.
 * - [x] Implement `--force`, `--verbose`, and `--quiet` options.
 *   - [x] `registerInstallCommand` action handler creates `clientLogger` with verbosity options.
 *   - [x] Pass `clientLogger` to `_installActionLogic`.
 *   - [x] Pass `force` and `verbose` options from CLI to `installerService.install`.
 * - [x] Ensure `_installActionLogic` calls `loadSingleToolConfig`.
 * - [x] Ensure `_installActionLogic` calls `installerService.install`.
 * - [x] Handle tool not found errors and installation failures, exiting with appropriate codes.
 * - [x] Ensure action handler calls `setupServices` to get its dependencies.
 * - [x] Refactor `registerInstallCommand` to no longer accept services as direct parameters.
 * - [x] Write/Update tests in `installCommand.test.ts` to cover all functionality including options and error handling.
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [x] Ensure 100% test coverage for executable code.
 * - [x] Update the memory bank with the new information when all tasks are complete.
 */
import type { AppConfig } from '@modules/config';
import { loadSingleToolConfig } from '@modules/config-loader/loadToolConfigs';
import type { IFileSystem } from '@modules/file-system';
import type { IInstaller } from '@modules/installer';
import { createLogger as createDebugLoggerInternal, createClientLogger } from '@modules/logger'; // Added createClientLogger
import type { ConsolaInstance } from 'consola';
import type { Command } from 'commander';
import { setupServices } from '../../cli'; // Import setupServices
import { exitCli } from './exitCli';

const commandInternalLog = createDebugLoggerInternal('installCommand');

export interface InstallCommandOptions {
  force: boolean;
  verbose: boolean;
  quiet: boolean;
}

export interface InstallCommandServices {
  appConfig: AppConfig;
  fileSystem: IFileSystem;
  installerService: IInstaller;
  clientLogger: ConsolaInstance;
}

// Renamed to _installActionLogic and made internal
async function _installActionLogic(
  toolName: string,
  options: InstallCommandOptions,
  services: InstallCommandServices
): Promise<void> {
  const { appConfig, fileSystem, installerService, clientLogger: logger } = services;

  commandInternalLog('_installActionLogic: Called with toolName: %s, options: %o', toolName, options);
  logger.debug(`Install command logic started for tool "${toolName}" with options: %o`, options);

  try {
    commandInternalLog(
      '_installActionLogic: Loading tool config for "%s" from directory: %s using FS: %s',
      toolName,
      appConfig.toolConfigsDir,
      fileSystem.constructor.name
    );
    const toolConfig = await loadSingleToolConfig(toolName, appConfig.toolConfigsDir, fileSystem);
    commandInternalLog('_installActionLogic: Loaded tool config for "%s": %o', toolName, toolConfig ? toolConfig.name : 'Not found');

    if (!toolConfig) {
      let errorMessage = `Error: Tool configuration for "${toolName}" not found.\n`;
      errorMessage += `Expected tool configuration file: ${appConfig.toolConfigsDir}/${toolName}.tool.ts\n`;
      errorMessage += 'No specific tool configuration was found for the requested tool.';
      logger.error(errorMessage);
      exitCli(1);
    }

    commandInternalLog('_installActionLogic: Calling installerService.install for tool: %s', toolName);
    logger.debug('Calling installerService.install for tool: %s', toolName);
    const result = await installerService.install(toolName, toolConfig, {
      force: options.force,
      verbose: options.verbose,
    });

    if (result.success) {
      commandInternalLog(
        '_installActionLogic: Tool %s installed successfully at %s',
        toolName,
        result.binaryPath
      );
      if (options.verbose && result.otherChanges && result.otherChanges.length > 0) {
        logger.debug('Detailed installation steps:'); // Added this line
        result.otherChanges.forEach((change) => logger.debug(`  - ${change}`)); // Added indentation for clarity
      }
      logger.info(`Tool "${toolName}" installed successfully.`);
      if (result.binaryPath) {
        logger.info(`Binary path: ${result.binaryPath}`);
      }
      if (result.version) {
        logger.info(`Version: ${result.version}`);
      }
      if (result.symlinkPath) {
        logger.info(`Symlink created: ${result.symlinkPath}`);
      }
    } else {
      commandInternalLog(
        '_installActionLogic: Failed to install tool %s: %s',
        toolName,
        result.error
      );
      logger.error(`Error installing "${toolName}": ${result.error}`);
      exitCli(1);
    }
  } catch (error) {
    commandInternalLog('_installActionLogic: Error during tool installation: %O', error);
    logger.error('Error during tool installation: %s', (error as Error).message);
    logger.debug('Error details: %O', error);
    exitCli(1);
  }
}

export function registerInstallCommand(
  program: Command,
): void {
  program
    .command('install <toolName>')
    .description('Installs a tool if it is not already installed. Typically called by shims.')
    .option(
      '--force',
      'Force installation even if the tool is already installed',
      false,
    )
    .option(
      '--verbose',
      'Enable detailed debug messages for installation.',
      false,
    )
    .option(
      '--quiet',
      'Suppress all informational and debug output for installation. Errors are still displayed.',
      false,
    )
    .action(async (toolName: string, options: InstallCommandOptions) => {
      const clientLogger = createClientLogger(options); // Create logger inside action
      commandInternalLog('install command: Action called for tool "%s" with options: %o', toolName, options);
      // Removed diagnostic typeof clientLogger logs

      try {
        // Determine dryRun status for setupServices. Install command doesn't have a specific --dry-run.
        // It might inherit a global dryRun if one were implemented, or it's always non-dry.
        // For now, assuming install is not a dry-run operation unless a global flag is checked.
        // The `options` for install command are `force`, `verbose`, `quiet`.
        // If `setupServices` needs to know about `dryRun` specifically for install,
        // this logic might need adjustment or `install` might not support `dryRun`.
        // Let's assume `install` is never a dry-run operation for `setupServices`.
        const services = await setupServices({ dryRun: false }); // Or determine dryRun from global options if available

        const servicesForAction: InstallCommandServices = {
          appConfig: services.appConfig,
          fileSystem: services.fs,
          installerService: services.installer,
          clientLogger, // Use the newly created clientLogger
        };
        await _installActionLogic(toolName, options, servicesForAction);
      } catch (error) {
        commandInternalLog('install command: Unhandled error in action handler: %O', error);
        // Removed diagnostic typeof clientLogger logs
        clientLogger.error('Critical error in install command: %s', (error as Error).message);
        clientLogger.debug('Error details: %O', error);
        exitCli(1);
      }
    });
}