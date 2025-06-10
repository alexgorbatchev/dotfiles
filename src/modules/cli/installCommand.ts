import type { AppConfig } from '@modules/config';
import { loadSingleToolConfig } from '@modules/config-loader/loadToolConfigs';
import type { IFileSystem } from '@modules/file-system';
import type { IInstaller } from '@modules/installer';
import { createLogger as createDebugLoggerInternal, createClientLogger } from '@modules/logger';
import type { ConsolaInstance } from 'consola';
import type { Command } from 'commander';
import { setupServices } from '../../cli';
import { exitCli } from '../../exitCli';

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
        result.otherChanges.forEach((change) => logger.debug(change));
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

export function registerInstallCommand(program: Command): void {
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
      const clientLogger = createClientLogger(options);
      commandInternalLog('install command: Action called for tool "%s" with options: %o', toolName, options);
      try {
        const coreServices = await setupServices(); // Assuming setupServices doesn't need specific options for install
        
        const servicesForAction: InstallCommandServices = {
          appConfig: coreServices.appConfig,
          fileSystem: coreServices.fs,
          installerService: coreServices.installer,
          clientLogger,
        };
        await _installActionLogic(toolName, options, servicesForAction);
      } catch (error) {
        commandInternalLog('install command: Unhandled error in action handler: %O', error);
        clientLogger.error('Critical error in install command: %s', (error as Error).message);
        clientLogger.debug('Error details: %O', error);
      exitCli(1)
      }
    });
}