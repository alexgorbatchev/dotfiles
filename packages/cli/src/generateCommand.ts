import type { TsLogger } from '@dotfiles/logger';
import { exitCli, generateToolTypes } from '@dotfiles/utils';
import path from 'node:path';
import { generateZshCompletion } from './generateZshCompletion';
import { messages } from './log-messages';
import type { IGlobalProgram, IGlobalProgramOptions, IServices } from './types';

// Re-export the completion metadata for external use
export * from './generateCommandCompletion';

/**
 * The binary name for the dotfiles CLI.
 */
const DOTFILES_CLI_BINARY_NAME = 'dotfiles';

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

/**
 * Generates the CLI completion file for zsh.
 */
async function generateCliCompletions(logger: TsLogger, services: IServices, toolNames: string[]): Promise<void> {
  const subLogger = logger.getSubLogger({ name: 'generateCliCompletions' });
  const { projectConfig, fs } = services;

  const completionContent = generateZshCompletion(DOTFILES_CLI_BINARY_NAME, toolNames);
  const completionDir = path.join(projectConfig.paths.shellScriptsDir, 'zsh', 'completions');
  const completionPath = path.join(completionDir, `_${DOTFILES_CLI_BINARY_NAME}`);

  await fs.ensureDir(completionDir);
  await fs.writeFile(completionPath, completionContent);
  subLogger.debug(messages.cliCompletionGenerated(completionPath));
}

export function registerGenerateCommand(
  parentLogger: TsLogger,
  program: IGlobalProgram,
  servicesFactory: () => Promise<IServices>,
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerGenerateCommand' });
  program
    .command('generate')
    .description('Generates shims, shell init files, and symlinks based on tool configurations.')
    .option('--overwrite', 'Overwrite conflicting files that were not created by the generator')
    .action(async (options: IGenerateCommandSpecificOptions) => {
      const combinedOptions: IGenerateCommandOptions = { ...options, ...program.opts() };
      const services = await servicesFactory();
      const { projectConfig, fs, generatorOrchestrator, configService, systemInfo, installer } = services;

      try {
        logger.debug(messages.toolConfigsLoading(projectConfig.paths.toolConfigsDir), fs.constructor.name);
        const toolConfigs = await configService.loadToolConfigs(
          logger,
          projectConfig.paths.toolConfigsDir,
          fs,
          projectConfig,
          systemInfo,
        );
        logger.debug(messages.toolConfigsLoaded(projectConfig.paths.toolConfigsDir, Object.keys(toolConfigs).length));

        const toolTypesPath: string = path.join(projectConfig.paths.generatedDir, 'tool-types.d.ts');
        await generateToolTypes(toolConfigs, toolTypesPath, fs);
        logger.debug(messages.toolTypesGenerated(toolTypesPath));

        await generatorOrchestrator.generateAll(toolConfigs, { overwrite: combinedOptions.overwrite, installer });

        // Generate CLI completions after tool completions
        const toolNames = Object.keys(toolConfigs).toSorted((a, b) => a.localeCompare(b));
        await generateCliCompletions(logger, services, toolNames);

        logger.info(messages.commandCompleted(Boolean(combinedOptions.dryRun)));
      } catch (_error) {
        logger.error(messages.commandExecutionFailed('generate', 1));
        exitCli(1);
      }
    });
}
