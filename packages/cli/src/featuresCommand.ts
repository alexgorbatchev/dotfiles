import type { TsLogger } from '@dotfiles/logger';
import { exitCli } from '@dotfiles/utils';
import { messages } from './log-messages';
import type { BaseCommandOptions, GlobalProgram, Services } from './types';

export interface FeaturesCommandOptions extends BaseCommandOptions {
  // No command-specific options for features command
}

async function catalogActionLogic(
  logger: TsLogger,
  _options: FeaturesCommandOptions,
  services: Services
): Promise<void> {
  try {
    const { yamlConfig, fs, configService, readmeService } = services;

    const toolConfigs = await configService.loadToolConfigs(logger, yamlConfig.paths.toolConfigsDir, fs, yamlConfig);

    await readmeService.generateCatalogFromConfigs(yamlConfig.features.catalog.filePath, toolConfigs);
  } catch (error) {
    logger.error(messages.commandExecutionFailed('features catalog', 1), error);
    exitCli(1);
  }
}

export function registerFeaturesCommand(
  parentLogger: TsLogger,
  program: GlobalProgram,
  servicesFactory: () => Promise<Services>
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerFeaturesCommand' });

  const featuresCmd = program
    .command('features')
    .description('Manage features and generate feature-specific artifacts.');

  // Catalog subcommand
  featuresCmd
    .command('catalog')
    .description('Generate a catalog of configured GitHub tools with their descriptions.')
    .action(async (options) => {
      const combinedOptions: FeaturesCommandOptions = { ...options, ...program.opts() };
      logger.debug(messages.commandActionCalled('catalog'));
      const services = await servicesFactory();
      await catalogActionLogic(logger, combinedOptions, services);

      logger.info(messages.commandCompleted(Boolean(combinedOptions.dryRun)));
    });
}
