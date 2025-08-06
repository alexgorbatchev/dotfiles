import { loadToolConfigsFromDirectory } from '@modules/config-loader/loadToolConfigs';
import { type TsLogger } from '@modules/logger';
import { ErrorTemplates, SuccessTemplates, DebugTemplates } from '@modules/shared/ErrorTemplates';
import { type GlobalProgram, type Services } from '../../cli';
import { exitCli } from './exitCli';

export interface GenerateCommandOptions {
  dryRun: boolean;
  verbose: boolean;
  quiet: boolean;
}

export function registerGenerateCommand(
  parentLogger: TsLogger,
  program: GlobalProgram,
  servicesFactory: () => Promise<Services>,
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerGenerateCommand' });
  program
    .command('generate')
      .description('Generates shims, shell init files, and symlinks based on tool configurations.')
      .action(async (options) => {
        const combinedOptions = { ...options, ...program.opts() };
        const services = await servicesFactory();
        const { yamlConfig, fs, generatorOrchestrator } = services;
  
        logger.debug(DebugTemplates.command.actionCalled('generate'), combinedOptions);
  
        try {
          logger.debug(SuccessTemplates.config.toolConfigLoading(yamlConfig.paths.toolConfigsDir), fs.constructor.name);
          const toolConfigs = await loadToolConfigsFromDirectory(logger, yamlConfig.paths.toolConfigsDir, fs);
          logger.debug(SuccessTemplates.config.loaded('tool configs', Object.keys(toolConfigs).length));
  
          const manifest = await generatorOrchestrator.generateAll(toolConfigs, {});
          logger.debug(DebugTemplates.generator.orchestrationComplete(), manifest);
  
  

  
          const numSymlinks = manifest.symlinks?.length ?? 0;
          if (combinedOptions.verbose && manifest.symlinks && numSymlinks > 0) {
            manifest.symlinks.forEach((op) => {
              logger.debug(SuccessTemplates.general.symlinkOperation(op.targetPath, op.sourcePath, op.status, op.error));
            });
          }
  
          if (combinedOptions.dryRun) {
            logger.info(SuccessTemplates.general.completed('Dry run completed'));
          }
        } catch (error) {
          logger.error(ErrorTemplates.command.executionFailed('generate', 1, (error as Error).message), error);
          exitCli(1);
        }
      });
  }