import type { TsLogger } from '@dotfiles/logger';
import { exitCli } from '@dotfiles/utils';
import { cliLogMessages } from './log-messages';
import type { BaseCommandOptions, GlobalProgram, Services } from './types';

export interface GenerateCommandOptions extends BaseCommandOptions {
  // No command-specific options for generate command
}

export function registerGenerateCommand(
  parentLogger: TsLogger,
  program: GlobalProgram,
  servicesFactory: () => Promise<Services>
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerGenerateCommand' });
  program
    .command('generate')
    .description('Generates shims, shell init files, and symlinks based on tool configurations.')
    .action(async () => {
      logger.debug(cliLogMessages.commandActionCalled('generate'));

      const combinedOptions: GenerateCommandOptions = program.opts();
      const services = await servicesFactory();
      const { yamlConfig, fs, generatorOrchestrator, configService } = services;

      try {
        logger.debug(cliLogMessages.toolConfigsLoading(yamlConfig.paths.toolConfigsDir), fs.constructor.name);
        const toolConfigs = await configService.loadToolConfigs(
          logger,
          yamlConfig.paths.toolConfigsDir,
          fs,
          yamlConfig
        );
        logger.debug(
          cliLogMessages.toolConfigsLoaded(yamlConfig.paths.toolConfigsDir, Object.keys(toolConfigs).length)
        );

        await generatorOrchestrator.generateAll(toolConfigs);
        logger.info(cliLogMessages.commandCompleted(Boolean(combinedOptions.dryRun)));
      } catch (error) {
        logger.error(cliLogMessages.commandExecutionFailed('generate', 1), error);
        exitCli(1);
      }
    });
}
