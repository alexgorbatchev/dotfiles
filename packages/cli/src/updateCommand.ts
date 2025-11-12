import type { IConfigService, YamlConfig } from '@dotfiles/config';
import type { BaseInstallContext, ToolConfig } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { ExitCode, exitCli } from '@dotfiles/utils';
import { messages } from './log-messages';
import type { BaseCommandOptions, GlobalProgram, Services, UpdateCommandSpecificOptions } from './types';

export interface UpdateCommandOptions extends BaseCommandOptions {
  yes: boolean;
  shimMode: boolean;
}

async function loadToolConfigSafely(
  logger: TsLogger,
  configService: IConfigService,
  toolName: string,
  toolConfigsDir: string,
  fs: IFileSystem,
  yamlConfig: YamlConfig
): Promise<{ toolConfig: ToolConfig | null; exitCode: ExitCode }> {
  try {
    const toolConfig = await configService.loadSingleToolConfig(logger, toolName, toolConfigsDir, fs, yamlConfig);

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
  services: Services,
  toolName: string,
  toolConfig: ToolConfig,
  shimMode: boolean
): Promise<void> {
  const { pluginRegistry, systemInfo, yamlConfig } = services;

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
  const getToolDir = (toolName: string): string => `${yamlConfig.paths.binariesDir}/${toolName}`;

  const context: BaseInstallContext = {
    toolName,
    installDir: yamlConfig.paths.binariesDir,
    timestamp: timestamp || '',
    systemInfo,
    toolConfig,
    appConfig: yamlConfig,
    toolDir: getToolDir(toolName),
    getToolDir,
    homeDir: yamlConfig.paths.homeDir,
    binDir: yamlConfig.paths.targetDir,
    shellScriptsDir: yamlConfig.paths.shellScriptsDir,
    dotfilesDir: yamlConfig.paths.dotfilesDir,
    generatedDir: yamlConfig.paths.generatedDir,
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
  program: GlobalProgram,
  servicesFactory: () => Promise<Services>
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerUpdateCommand' });
  program
    .command('update <toolName>')
    .description('Updates a specified tool to its latest version.')
    .option('-y, --yes', 'Automatically confirm updates', false)
    .option('--shim-mode', 'Run in shim mode with minimal output', false)
    .action(async (toolName: string, commandOptions: UpdateCommandSpecificOptions) => {
      logger.debug(messages.commandActionCalled('update'));

      const combinedOptions: UpdateCommandOptions = { ...commandOptions, ...program.opts() };

      const services = await servicesFactory();
      const { yamlConfig, fs, configService } = services;

      try {
        const toolConfigResult = await loadToolConfigSafely(
          logger,
          configService,
          toolName,
          yamlConfig.paths.toolConfigsDir,
          fs,
          yamlConfig
        );

        if (toolConfigResult.exitCode !== ExitCode.SUCCESS) {
          exitCli(toolConfigResult.exitCode);
          return;
        }

        if (!toolConfigResult.toolConfig) {
          logger.error(messages.toolNotFound(toolName, yamlConfig.paths.toolConfigsDir));
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
