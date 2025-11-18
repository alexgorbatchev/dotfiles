import path from 'node:path';
import type { TsLogger } from '@dotfiles/logger';
import { exitCli, generateToolTypes } from '@dotfiles/utils';
import { messages } from './log-messages';
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
      logger.debug(messages.commandActionCalled('generate'));

      const combinedOptions: GenerateCommandOptions = program.opts();
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

        await generatorOrchestrator.generateAll(toolConfigs);

        logger.info(messages.commandCompleted(Boolean(combinedOptions.dryRun)));
      } catch (_error) {
        logger.error(messages.commandExecutionFailed('generate', 1));
        exitCli(1);
      }
    });
}
