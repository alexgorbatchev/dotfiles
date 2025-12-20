import path from 'node:path';
import type { IConfigService } from '@dotfiles/config';
import type { IInstallContext, ProjectConfig, ToolConfig } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import { createConfiguredShell } from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import { ExitCode, exitCli } from '@dotfiles/utils';
import { $ } from 'bun';
import { messages } from './log-messages';
import type {
  ICommandCompletionMeta,
  IGlobalProgram,
  IGlobalProgramOptions,
  IServices,
  IUpdateCommandSpecificOptions,
} from './types';

/**
 * Completion metadata for the update command.
 */
export const UPDATE_COMMAND_COMPLETION: ICommandCompletionMeta = {
  name: 'update',
  description: 'Update an installed tool to latest version',
  hasPositionalArg: true,
  positionalArgDescription: 'tool name to update',
  positionalArgType: 'tool',
  options: [{ flag: '--shim-mode', description: 'Optimized output for shim usage' }],
};

async function loadToolConfigSafely(
  logger: TsLogger,
  configService: IConfigService,
  toolName: string,
  toolConfigsDir: string,
  fs: IFileSystem,
  projectConfig: ProjectConfig
): Promise<{ toolConfig: ToolConfig | null; exitCode: ExitCode }> {
  try {
    const toolConfig = await configService.loadSingleToolConfig(logger, toolName, toolConfigsDir, fs, projectConfig);

    if (!toolConfig) {
      logger.error(messages.toolNotFound(toolName, toolConfigsDir));
      return { toolConfig: null, exitCode: ExitCode.ERROR };
    }

    return { toolConfig, exitCode: ExitCode.SUCCESS };
  } catch (error) {
    logger.error(messages.configLoadFailed(`tool "${toolName}"`), error);
    return { toolConfig: null, exitCode: ExitCode.ERROR };
  }
}

async function handleToolUpdate(
  logger: TsLogger,
  services: IServices,
  toolName: string,
  toolConfig: ToolConfig,
  shimMode: boolean
): Promise<void> {
  const { pluginRegistry, systemInfo, projectConfig, fs } = services;

  const plugin = pluginRegistry.get(toolConfig.installationMethod);

  if (!plugin) {
    logger.info(
      messages.commandUnsupportedOperation(
        'Update',
        `installation method: "${toolConfig.installationMethod}" for tool "${toolName}"`
      )
    );
    return;
  }

  if (!plugin.supportsUpdate || !plugin.supportsUpdate()) {
    logger.info(
      messages.commandUnsupportedOperation(
        'Update',
        `installation method: "${toolConfig.installationMethod}" for tool "${toolName}"`
      )
    );
    return;
  }

  // Create context for plugin
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const toolDir: string = toolConfig.configFilePath
    ? path.dirname(toolConfig.configFilePath)
    : projectConfig.paths.toolConfigsDir;

  const context: IInstallContext = {
    toolName,
    toolDir,
    installDir: projectConfig.paths.binariesDir,
    timestamp: timestamp || '',
    systemInfo,
    toolConfig,
    projectConfig: projectConfig,
    $: createConfiguredShell($, process.env),
    fileSystem: fs,
  };

  const updateResult = await plugin.updateTool?.(toolName, toolConfig, context, { force: true }, logger);

  if (!updateResult) {
    logger.debug(messages.commandUnsupportedOperation('update', toolName));
    return;
  }

  if (!updateResult.success) {
    logger.error(messages.toolUpdateFailed(toolName, updateResult.error));
    exitCli(ExitCode.ERROR);
    return;
  }

  const oldVersion = updateResult.oldVersion || toolConfig.version || 'unknown';
  const newVersion = updateResult.newVersion || 'unknown';
  const isUpToDate = oldVersion === newVersion;

  if (shimMode) {
    if (isUpToDate) {
      logger.info(messages.toolShimUpToDate(toolName, newVersion));
    } else {
      logger.info(messages.toolShimUpdateStarting(toolName, oldVersion, newVersion));
      logger.info(messages.toolShimUpdateSuccess(toolName, newVersion));
    }
  } else {
    logger.info(messages.toolUpdated(toolName, oldVersion, newVersion));
  }
}

export function registerUpdateCommand(
  parentLogger: TsLogger,
  program: IGlobalProgram,
  servicesFactory: () => Promise<IServices>
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerUpdateCommand' });
  program
    .command('update <toolName>')
    .description('Updates a specified tool to its latest version.')
    .option('--shim-mode', 'Run in shim mode with minimal output', false)
    .action(async (toolName: string, commandOptions: IUpdateCommandSpecificOptions) => {
      const combinedOptions: IUpdateCommandSpecificOptions & IGlobalProgramOptions = {
        ...commandOptions,
        ...program.opts(),
      };

      const services = await servicesFactory();
      const { projectConfig, fs, configService } = services;

      try {
        const toolConfigResult = await loadToolConfigSafely(
          logger,
          configService,
          toolName,
          projectConfig.paths.toolConfigsDir,
          fs,
          projectConfig
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
        logger.error(messages.commandExecutionFailed('update', ExitCode.ERROR), error);
        exitCli(ExitCode.ERROR);
      }
    });
}
