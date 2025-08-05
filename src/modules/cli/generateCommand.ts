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
  
        logger.debug(DebugTemplates.command.errorDetails(), combinedOptions);
  
        try {
          logger.debug(DebugTemplates.command.errorDetails(), yamlConfig.paths.toolConfigsDir, fs.constructor.name);
          const toolConfigs = await loadToolConfigsFromDirectory(logger, yamlConfig.paths.toolConfigsDir, fs);
          logger.debug(DebugTemplates.command.errorDetails(), Object.keys(toolConfigs).length);
  
          const manifest = await generatorOrchestrator.generateAll(toolConfigs, {});
          logger.debug(DebugTemplates.command.errorDetails(), manifest);
          logger.info(SuccessTemplates.operation.completed('Artifact generation', 0));
  
          const numShims = manifest.shims?.length ?? 0;
          logger.info(SuccessTemplates.operation.completed('Shim generation', 0, numShims), yamlConfig.paths.targetDir);
          if (numShims > 0) {
            logger.info(SuccessTemplates.general.generatedShimsByTool());
            Object.values(toolConfigs).forEach((toolConfig) => {
              if (toolConfig.binaries && toolConfig.binaries.length > 0) {
                if (toolConfig.binaries.length === 1 && toolConfig.binaries[0] === toolConfig.name) {
                  logger.info(SuccessTemplates.tool.processing(toolConfig.name, 'shim generation'));
                } else {
                  logger.info(SuccessTemplates.tool.processing(toolConfig.name, `shim generation: ${toolConfig.binaries.join(', ')}`));
                }
              }
            });
          }
  
          if (combinedOptions.verbose && manifest.shims && numShims > 0) {
            logger.debug(DebugTemplates.command.errorDetails());
            manifest.shims.forEach((shimPath) => logger.debug(DebugTemplates.command.errorDetails(), shimPath));
          }
  
          if (manifest.shellInit?.path) {
            logger.info(SuccessTemplates.fs.created('shell-init', manifest.shellInit.path));
            if (combinedOptions.verbose) {
              logger.debug(DebugTemplates.command.errorDetails(), manifest.shellInit.path);
            }
          } else {
            logger.info(SuccessTemplates.general.completed('No shell init file generated'));
          }
  
          const numSymlinks = manifest.symlinks?.length ?? 0;
          logger.info(SuccessTemplates.operation.completed('Symlink operations', 0, numSymlinks));
          if (combinedOptions.verbose && manifest.symlinks && numSymlinks > 0) {
            logger.debug(DebugTemplates.command.errorDetails());
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