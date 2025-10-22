import type { GlobalProgram, Services } from '@cli';
import { loadToolConfigs } from '@modules/config-loader/loadToolConfigs';
import type { TsLogger } from '@modules/logger';
import { exitCli } from './exitCli';
import { cliLogMessages } from './log-messages';

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
    .action(async (options) => {
      const combinedOptions = { ...options, ...program.opts() };
      const services = await servicesFactory();
      const { yamlConfig, fs, generatorOrchestrator } = services;

      logger.debug(cliLogMessages.commandActionCalled('generate'), combinedOptions);

      try {
        logger.debug(cliLogMessages.toolConfigsLoading(yamlConfig.paths.toolConfigsDir), fs.constructor.name);
        const toolConfigs = await loadToolConfigs(logger, yamlConfig.paths.toolConfigsDir, fs, yamlConfig);
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
