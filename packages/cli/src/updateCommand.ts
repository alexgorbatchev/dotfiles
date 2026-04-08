import type { IConfigService } from "@dotfiles/config";
import type { ISystemInfo, ProjectConfig, ToolConfig } from "@dotfiles/core";
import type { IResolvedFileSystem } from "@dotfiles/file-system";
import type { TsLogger } from "@dotfiles/logger";
import { exitCli, ExitCode } from "@dotfiles/utils";
import { messages } from "./log-messages";
import type {
  ICommandCompletionMeta,
  IGlobalProgram,
  IGlobalProgramOptions,
  IServices,
  IUpdateCommandSpecificOptions,
  ServicesFactory,
} from "./types";

interface ILoadToolConfigSafelyResult {
  toolConfig: ToolConfig | null;
  exitCode: ExitCode;
}

type UpdateCommandOptions = IUpdateCommandSpecificOptions & IGlobalProgramOptions;

/**
 * Completion metadata for the update command.
 */
export const UPDATE_COMMAND_COMPLETION: ICommandCompletionMeta = {
  name: "update",
  description: "Update an installed tool to latest version",
  hasPositionalArg: true,
  positionalArgDescription: "tool name to update",
  positionalArgType: "tool",
  options: [{ flag: "--shim-mode", description: "Optimized output for shim usage" }],
};

async function loadToolConfigSafely(
  logger: TsLogger,
  configService: IConfigService,
  toolName: string,
  toolConfigsDir: string,
  fs: IResolvedFileSystem,
  projectConfig: ProjectConfig,
  systemInfo: ISystemInfo,
): Promise<ILoadToolConfigSafelyResult> {
  try {
    const toolConfig = await configService.loadSingleToolConfig(
      logger,
      toolName,
      toolConfigsDir,
      fs,
      projectConfig,
      systemInfo,
    );

    if (!toolConfig) {
      logger.error(messages.toolNotFound(toolName, toolConfigsDir));
      const result: ILoadToolConfigSafelyResult = { toolConfig: null, exitCode: ExitCode.ERROR };
      return result;
    }

    const result: ILoadToolConfigSafelyResult = { toolConfig, exitCode: ExitCode.SUCCESS };
    return result;
  } catch (error) {
    logger.error(messages.configLoadFailed(`tool "${toolName}"`), error);
    const result: ILoadToolConfigSafelyResult = { toolConfig: null, exitCode: ExitCode.ERROR };
    return result;
  }
}

async function handleToolUpdate(
  logger: TsLogger,
  services: IServices,
  toolName: string,
  toolConfig: ToolConfig,
  shimMode: boolean,
): Promise<void> {
  const { toolInstallationRegistry, installer, pluginRegistry } = services;

  if (toolConfig.version !== "latest") {
    logger.info(messages.toolVersionPinned(toolName, toolConfig.version));
    return;
  }

  const plugin = pluginRegistry.get(toolConfig.installationMethod);

  if (plugin && !plugin.supportsUpdate()) {
    logger.warn(messages.toolUpdateNotSupported(toolName, toolConfig.installationMethod));
  }

  const existingInstallation = await toolInstallationRegistry.getToolInstallation(toolName);
  const oldVersion = existingInstallation?.version || "unknown";

  const installResult = await installer.install(toolName, toolConfig, { force: true, shimMode });

  if (!installResult.success) {
    logger.error(messages.toolUpdateFailed(toolName, installResult.error));
    exitCli(ExitCode.ERROR);
    return;
  }

  const resolvedNewVersion: string =
    "version" in installResult && typeof installResult.version === "string" ? installResult.version : "unknown";
  const isUpToDate = oldVersion === resolvedNewVersion;

  if (shimMode) {
    if (isUpToDate) {
      logger.info(messages.toolShimUpToDate(toolName, resolvedNewVersion));
    } else {
      logger.info(messages.toolShimUpdateStarting(toolName, oldVersion, resolvedNewVersion));
      logger.info(messages.toolShimUpdateSuccess(toolName, resolvedNewVersion));
    }
  } else {
    logger.info(messages.toolUpdated(toolName, oldVersion, resolvedNewVersion));
  }
}

export function registerUpdateCommand(
  parentLogger: TsLogger,
  program: IGlobalProgram,
  servicesFactory: ServicesFactory,
): void {
  const logger = parentLogger.getSubLogger({ name: "registerUpdateCommand" });
  program
    .command("update <toolName>")
    .description("Updates a specified tool to its latest version.")
    .option("--shim-mode", "Run in shim mode with minimal output", false)
    .action(async (toolName: string, commandOptions: IUpdateCommandSpecificOptions) => {
      const combinedOptions: UpdateCommandOptions = {
        ...commandOptions,
        ...program.opts(),
      };

      const services = await servicesFactory();
      const { projectConfig, fs, configService, systemInfo } = services;

      try {
        const toolConfigResult = await loadToolConfigSafely(
          logger,
          configService,
          toolName,
          projectConfig.paths.toolConfigsDir,
          fs,
          projectConfig,
          systemInfo,
        );

        if (toolConfigResult.exitCode !== ExitCode.SUCCESS) {
          exitCli(toolConfigResult.exitCode);
          return;
        }

        if (!toolConfigResult.toolConfig) {
          logger.error(messages.toolNotFound(toolName, projectConfig.paths.toolConfigsDir));
          exitCli(ExitCode.ERROR);
          return;
        }

        const toolConfig = toolConfigResult.toolConfig;

        if (!combinedOptions.shimMode) {
          logger.info(messages.commandCheckingUpdatesFor(toolName));
        }

        await handleToolUpdate(logger, services, toolName, toolConfig, combinedOptions.shimMode);
      } catch (error) {
        logger.error(messages.commandExecutionFailed("update", ExitCode.ERROR), error);
        exitCli(ExitCode.ERROR);
      }
    });
}
