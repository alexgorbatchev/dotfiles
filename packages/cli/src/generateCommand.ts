import type { TsLogger } from '@dotfiles/logger';
import { exitCli } from '@dotfiles/utils';
import { cliLogMessages } from './log-messages';
import type { GlobalProgram, Services } from './types';

export interface GenerateCommandOptions {
  dryRun: boolean;
  verbose: boolean;
  quiet: boolean;
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
    // biome-ignore lint/suspicious/noExplicitAny: Commander action callback types are not properly typed
    .action(async (_options: any) => {
      const combinedOptions: GenerateCommandOptions = program.opts() as GenerateCommandOptions;
      const services = await servicesFactory();
      const { yamlConfig, fs, generatorOrchestrator, configService } = services;

      logger.debug(cliLogMessages.commandActionCalled('generate'), combinedOptions);

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

        await generatorOrchestrator.generateAll(toolConfigs, {});
        logger.info(cliLogMessages.commandCompleted(Boolean(combinedOptions.dryRun)));
      } catch (error) {
        const failureMessage = cliLogMessages.commandExecutionFailed('generate', 1, (error as Error).message);
        logger.error(failureMessage, error);
        exitCli(1);
      }
    });
}
