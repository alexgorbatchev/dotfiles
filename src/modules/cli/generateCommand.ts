import type { GlobalProgram, Services } from '@cli';
import { loadToolConfigs } from '@modules/config-loader/loadToolConfigs';
import { logs, type TsLogger } from '@modules/logger';
import { exitCli } from './exitCli';

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

      logger.debug(logs.command.debug.actionCalled('generate'), combinedOptions);

      try {
        logger.debug(logs.config.success.toolConfigLoading(yamlConfig.paths.toolConfigsDir), fs.constructor.name);
        const toolConfigs = await loadToolConfigs(logger, yamlConfig.paths.toolConfigsDir, fs, yamlConfig);
        logger.debug(logs.config.success.loaded('tool configs', Object.keys(toolConfigs).length));

        const manifest = await generatorOrchestrator.generateAll(toolConfigs, {});
        logger.debug(logs.generator.debug.orchestrationComplete(), manifest);

        const numSymlinks = manifest.symlinks?.length ?? 0;
        if (combinedOptions.verbose && manifest.symlinks && numSymlinks > 0) {
          manifest.symlinks.forEach((op) => {
            logger.debug(logs.general.success.symlinkOperation(op.targetPath, op.sourcePath, op.status, op.error));
          });
        }

        logger.info(logs.general.success.done(combinedOptions.dryRun));
      } catch (error) {
        logger.error(logs.command.error.executionFailed('generate', 1, (error as Error).message), error);
        exitCli(1);
      }
    });
}
