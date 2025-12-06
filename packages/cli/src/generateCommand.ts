import path from 'node:path';
import type { TsLogger } from '@dotfiles/logger';
import { exitCli, generateToolTypes } from '@dotfiles/utils';
import { messages } from './log-messages';
import type { IGlobalProgram, IGlobalProgramOptions, IServices } from './types';

/**
 * Command-specific options for the generate command.
 */
export interface IGenerateCommandSpecificOptions {
  overwrite?: boolean;
}

/**
 * Combined options for the generate command (command-specific + global).
 */
export interface IGenerateCommandOptions extends IGenerateCommandSpecificOptions, IGlobalProgramOptions {}

export function registerGenerateCommand(
  parentLogger: TsLogger,
  program: IGlobalProgram,
  servicesFactory: () => Promise<IServices>
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerGenerateCommand' });
  program
    .command('generate')
    .description('Generates shims, shell init files, and symlinks based on tool configurations.')
    .option('--overwrite', 'Overwrite conflicting files that were not created by the generator')
    .action(async (options: IGenerateCommandSpecificOptions) => {
      const combinedOptions: IGenerateCommandOptions = { ...options, ...program.opts() };
      const services = await servicesFactory();
      const { projectConfig, fs, generatorOrchestrator, configService } = services;

      try {
        logger.debug(messages.toolConfigsLoading(projectConfig.paths.toolConfigsDir), fs.constructor.name);
        const toolConfigs = await configService.loadToolConfigs(
          logger,
          projectConfig.paths.toolConfigsDir,
          fs,
          projectConfig
        );
        logger.debug(messages.toolConfigsLoaded(projectConfig.paths.toolConfigsDir, Object.keys(toolConfigs).length));

        const toolTypesPath: string = path.join(projectConfig.paths.generatedDir, 'tool-types.d.ts');
        await generateToolTypes(toolConfigs, toolTypesPath, fs);
        logger.debug(messages.toolTypesGenerated(toolTypesPath));

        await generatorOrchestrator.generateAll(toolConfigs, { overwrite: combinedOptions.overwrite });

        logger.info(messages.commandCompleted(Boolean(combinedOptions.dryRun)));
      } catch (_error) {
        logger.error(messages.commandExecutionFailed('generate', 1));
        exitCli(1);
      }
    });
}
