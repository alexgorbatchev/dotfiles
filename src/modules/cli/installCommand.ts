import { loadSingleToolConfig } from '@modules/config-loader/loadToolConfigs';
import { type TsLogger } from '@modules/logger';
import { ErrorTemplates } from '@modules/shared/ErrorTemplates';
import { type GlobalProgram, type Services } from '../../cli';
import { exitCli } from './exitCli';

export function registerInstallCommand(
  parentLogger: TsLogger,
  program: GlobalProgram,
  services: Services,
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerInstallCommand' });
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
      logger.debug('install command: Action called for tool "%s" with options: %o', toolName, combinedOptions);

      const { yamlConfig, fs, installer } = services;

      try {
        logger.debug(
          'Loading tool config for "%s" from directory: %s using FS: %s',
          toolName,
          yamlConfig.paths.toolConfigsDir,
          fs.constructor.name,
        );
        const toolConfig = await loadSingleToolConfig(logger, toolName, yamlConfig.paths.toolConfigsDir, fs);
        logger.debug('Loaded tool config for "%s": %o', toolName, toolConfig ? toolConfig.name : 'Not found');

        if (!toolConfig) {
          logger.error(ErrorTemplates.tool.notFound(toolName, yamlConfig.paths.toolConfigsDir));
          exitCli(1);
        }

        logger.debug('Calling installerService.install for tool: %s', toolName);
        const result = await installer.install(toolName, toolConfig, {
          force: combinedOptions.force,
          verbose: combinedOptions.verbose,
        });

        if (result.success) {
          logger.debug(
            'Tool %s installed successfully at %s',
            toolName,
            result.binaryPath,
          );
          if (combinedOptions.verbose && result.otherChanges && result.otherChanges.length > 0) {
            logger.debug('Detailed installation steps:');
            result.otherChanges.forEach((change) => logger.debug(`  - ${change}`));
          }
          logger.info(`Tool "${toolName}" installed successfully.`);
          if (result.binaryPath) {
            logger.info(`Binary path: ${result.binaryPath}`);
          }
          if (result.version) {
            logger.info(`Version: ${result.version}`);
          }
        } else {
          logger.debug(
            'Failed to install tool %s: %s',
            toolName,
            result.error,
          );
          logger.error(ErrorTemplates.tool.installFailed('unknown', toolName, result.error || 'Unknown error'));
          exitCli(1);
        }
      } catch (error) {
        logger.debug('Error during tool installation: %O', error);
        logger.error(ErrorTemplates.command.executionFailed('install', 1, (error as Error).message));
        logger.debug('Error details: %O', error);
        exitCli(1);
      }
    });
}