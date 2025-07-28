import { loadSingleToolConfig } from '@modules/config-loader/loadToolConfigs';
import { createLogger, createClientLogger } from '@modules/logger';
import { type GlobalProgram, type Services } from '../../cli';
import { exitCli } from './exitCli';

const commandInternalLog = createLogger('installCommand');

export function registerInstallCommand(
  program: GlobalProgram,
  services: Services,
): void {
  program
    .command('install <toolName>')
    .description('Installs a tool if it is not already installed. Typically called by shims.')
    .option(
      '--force',
      'Force installation even if the tool is already installed',
      false,
    )
    .action(async (toolName, options) => {
      const combinedOptions = { ...options, ...program.opts() };
      const clientLogger = createClientLogger(combinedOptions);
      commandInternalLog('install command: Action called for tool "%s" with options: %o', toolName, combinedOptions);

      const { yamlConfig, fs, installer } = services;

      try {
        commandInternalLog(
          'Loading tool config for "%s" from directory: %s using FS: %s',
          toolName,
          yamlConfig.paths.toolConfigsDir,
          fs.constructor.name,
        );
        const toolConfig = await loadSingleToolConfig(toolName, yamlConfig.paths.toolConfigsDir, fs);
        commandInternalLog('Loaded tool config for "%s": %o', toolName, toolConfig ? toolConfig.name : 'Not found');

        if (!toolConfig) {
          let errorMessage = `Error: Tool configuration for "${toolName}" not found.\n`;
          errorMessage += `Expected tool configuration file: ${yamlConfig.paths.toolConfigsDir}/${toolName}.tool.ts\n`;
          errorMessage += 'No specific tool configuration was found for the requested tool.';
          clientLogger.error(errorMessage);
          exitCli(1);
        }

        commandInternalLog('Calling installerService.install for tool: %s', toolName);
        clientLogger.debug('Calling installerService.install for tool: %s', toolName);
        const result = await installer.install(toolName, toolConfig, {
          force: combinedOptions.force,
          verbose: combinedOptions.verbose,
        });

        if (result.success) {
          commandInternalLog(
            'Tool %s installed successfully at %s',
            toolName,
            result.binaryPath,
          );
          if (combinedOptions.verbose && result.otherChanges && result.otherChanges.length > 0) {
            clientLogger.debug('Detailed installation steps:');
            result.otherChanges.forEach((change) => clientLogger.debug(`  - ${change}`));
          }
          clientLogger.info(`Tool "${toolName}" installed successfully.`);
          if (result.binaryPath) {
            clientLogger.info(`Binary path: ${result.binaryPath}`);
          }
          if (result.version) {
            clientLogger.info(`Version: ${result.version}`);
          }
        } else {
          commandInternalLog(
            'Failed to install tool %s: %s',
            toolName,
            result.error,
          );
          clientLogger.error(`Error installing "${toolName}": ${result.error}`);
          exitCli(1);
        }
      } catch (error) {
        commandInternalLog('Error during tool installation: %O', error);
        clientLogger.error('Error during tool installation: %s', (error as Error).message);
        clientLogger.debug('Error details: %O', error);
        exitCli(1);
      }
    });
}