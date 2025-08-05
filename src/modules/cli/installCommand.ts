import { loadSingleToolConfig } from '@modules/config-loader/loadToolConfigs';
import { type TsLogger } from '@modules/logger';
import { ErrorTemplates, SuccessTemplates, DebugTemplates } from '@modules/shared/ErrorTemplates';
import { type GlobalProgram, type Services } from '../../cli';
import { exitCli } from './exitCli';

export function registerInstallCommand(
  parentLogger: TsLogger,
  program: GlobalProgram,
  servicesFactory: () => Promise<Services>,
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
      logger.debug(DebugTemplates.command.actionCalled('install', toolName), combinedOptions);

      const services = await servicesFactory();
      const { yamlConfig, fs, installer } = services;

      try {
        logger.debug(
          DebugTemplates.command.actionStarted('install', toolName),
          yamlConfig.paths.toolConfigsDir,
          fs.constructor.name,
        );
        const toolConfig = await loadSingleToolConfig(logger, toolName, yamlConfig.paths.toolConfigsDir, fs);
        // Tool configuration loaded, proceeding with installation

        if (!toolConfig) {
          logger.error(ErrorTemplates.tool.notFound(toolName, yamlConfig.paths.toolConfigsDir));
          exitCli(1);
        }

        // Starting installation process
        const result = await installer.install(toolName, toolConfig, {
          force: combinedOptions.force,
          verbose: combinedOptions.verbose,
        });

        if (result.success) {
          // Installation successful, logging result
          if (combinedOptions.verbose && result.otherChanges && result.otherChanges.length > 0) {
            // Additional changes logged by installer
            result.otherChanges.forEach((change) => logger.debug(SuccessTemplates.general.additionalChange(), change));
          }
          logger.info(SuccessTemplates.tool.installed(toolName, result.version || 'unknown', 'CLI'));
          // Additional debug info handled by installer
        } else {
          logger.debug(
            DebugTemplates.command.actionStarted('install-failed', toolName),
            result.error,
          );
          logger.error(ErrorTemplates.tool.installFailed('unknown', toolName, result.error || 'Unknown error'));
          exitCli(1);
        }
      } catch (error) {
        logger.debug(DebugTemplates.command.unhandledError(), error);
        logger.error(ErrorTemplates.command.executionFailed('install', 1, (error as Error).message));
        exitCli(1);
      }
    });
}