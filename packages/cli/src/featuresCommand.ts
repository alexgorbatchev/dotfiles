import type { TsLogger } from "@dotfiles/logger";
import { exitCli } from "@dotfiles/utils";
import { messages } from "./log-messages";
import type { IBaseCommandOptions, ICommandCompletionMeta, IGlobalProgram, IServices, ServicesFactory } from "./types";

/**
 * Completion metadata for the features command.
 */
export const FEATURES_COMMAND_COMPLETION: ICommandCompletionMeta = {
  name: "features",
  description: "Manage features and generate artifacts",
  subcommands: [
    {
      name: "catalog",
      description: "Generate catalog of available features",
    },
  ],
};

export interface IFeaturesCommandOptions extends IBaseCommandOptions {
  // No command-specific options for features command
}

async function catalogActionLogic(
  logger: TsLogger,
  _options: IFeaturesCommandOptions,
  services: IServices,
): Promise<void> {
  try {
    const { projectConfig, fs, configService, readmeService, systemInfo } = services;

    const toolConfigs = await configService.loadToolConfigs(
      logger,
      projectConfig.paths.toolConfigsDir,
      fs,
      projectConfig,
      systemInfo,
    );

    await readmeService.generateCatalogFromConfigs(projectConfig.features.catalog.filePath, toolConfigs);
  } catch (error) {
    logger.error(messages.commandExecutionFailed("features catalog", 1), error);
    exitCli(1);
  }
}

export function registerFeaturesCommand(
  parentLogger: TsLogger,
  program: IGlobalProgram,
  servicesFactory: ServicesFactory,
): void {
  const logger = parentLogger.getSubLogger({ name: "registerFeaturesCommand" });

  const featuresCmd = program
    .command("features")
    .description("Manage features and generate feature-specific artifacts.");

  // Catalog subcommand
  featuresCmd
    .command("catalog")
    .description("Catalog of available features documentation")
    .action(async () => {
      const combinedOptions: IFeaturesCommandOptions = program.opts();
      const services = await servicesFactory();
      await catalogActionLogic(logger, combinedOptions, services);

      logger.info(messages.commandCompleted(Boolean(combinedOptions.dryRun)));
    });
}
