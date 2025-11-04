import type { IConfigService, YamlConfig } from '@dotfiles/config';
import type { BaseInstallContext, ToolConfig } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { ExitCode, exitCli } from '@dotfiles/utils';
import { VersionComparisonStatus } from '@dotfiles/version-checker';
import { messages } from './log-messages';
import type { BaseCommandOptions, GlobalProgram, Services } from './types';

export interface CheckUpdatesCommandOptions extends BaseCommandOptions {
  // No command-specific options for check-updates command
}

async function loadToolConfigs(
  logger: TsLogger,
  configService: IConfigService,
  toolName: string | undefined,
  yamlConfig: YamlConfig,
  fs: IFileSystem
): Promise<Record<string, ToolConfig> | null> {
  let toolConfigs: Record<string, ToolConfig> = {};
  if (toolName) {
    logger.debug(messages.commandCheckingUpdatesFor(toolName));
    try {
      const config = await configService.loadSingleToolConfig(
        logger,
        toolName,
        yamlConfig.paths.toolConfigsDir,
        fs,
        yamlConfig
      );
      if (config) {
        toolConfigs[toolName] = config;
      } else {
        logger.error(messages.toolNotFound(toolName, yamlConfig.paths.toolConfigsDir));
        return null;
      }
    } catch (error) {
      logger.error(messages.configLoadFailed(`tool "${toolName}"`), error);
      return null;
    }
  } else {
    try {
      logger.debug(messages.commandCheckingUpdatesForAll());
      toolConfigs = await configService.loadToolConfigs(logger, yamlConfig.paths.toolConfigsDir, fs, yamlConfig);
      if (Object.keys(toolConfigs).length === 0) {
        logger.error(messages.toolNoConfigurationsFound(yamlConfig.paths.toolConfigsDir));
        return null;
      }
    } catch (error) {
      logger.error(messages.configLoadFailed('tool configurations'), error);
      return null;
    }
  }
  return toolConfigs;
}

export async function checkUpdatesActionLogic(
  logger: TsLogger,
  toolName: string | undefined,
  services: Services
): Promise<void> {
  const { yamlConfig, fs, versionChecker, pluginRegistry, systemInfo } = services;

  logger.trace(messages.commandActionStarted('check-updates', toolName || 'all'));

  const toolConfigs = await loadToolConfigs(logger, services.configService, toolName, yamlConfig, fs);
  if (!toolConfigs) {
    return;
  }

  for (const config of Object.values(toolConfigs)) {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const getToolDir = (toolName: string): string => `${yamlConfig.paths.binariesDir}/${toolName}`;

    const context: BaseInstallContext = {
      toolName: config.name,
      installDir: yamlConfig.paths.binariesDir,
      timestamp: timestamp || '',
      systemInfo,
      toolConfig: config,
      appConfig: yamlConfig,
      toolDir: getToolDir(config.name),
      getToolDir,
      homeDir: yamlConfig.paths.homeDir,
      binDir: yamlConfig.paths.targetDir,
      shellScriptsDir: yamlConfig.paths.shellScriptsDir,
      dotfilesDir: yamlConfig.paths.dotfilesDir,
      generatedDir: yamlConfig.paths.generatedDir,
      logger,
    };

    const plugin = pluginRegistry.get(config.installationMethod);

    if (!plugin) {
      logger.warn(
        messages.commandUnsupportedOperation(
          'check-updates',
          `installation method: "${config.installationMethod}" for tool "${config.name}"`
        )
      );
      continue;
    }

    if (!plugin.supportsUpdateCheck || !plugin.supportsUpdateCheck()) {
      logger.info(
        messages.commandUnsupportedOperation(
          'check-updates',
          `installation method: "${config.installationMethod}" for tool "${config.name}"`
        )
      );
      continue;
    }

    const updateCheckResult = await plugin.checkUpdate?.(config.name, config, context, logger);

    if (!updateCheckResult) {
      logger.warn(messages.commandUnsupportedOperation('check-updates', config.name));
      continue;
    }

    if (updateCheckResult.error) {
      logger.error(messages.serviceGithubApiFailed('check update', 0), new Error(updateCheckResult.error));
      continue;
    }

    const currentVersion = updateCheckResult.currentVersion || config.version || 'unknown';
    const latestVersion = updateCheckResult.latestVersion || 'unknown';

    if (currentVersion === 'latest') {
      logger.info(messages.toolConfiguredToLatest(config.name, latestVersion));
      continue;
    }

    if (updateCheckResult.hasUpdate) {
      logger.info(messages.toolUpdateAvailable(config.name, currentVersion, latestVersion));
    } else {
      const status = await versionChecker.checkVersionStatus(currentVersion, latestVersion);

      if (status === VersionComparisonStatus.UP_TO_DATE) {
        logger.info(messages.toolUpToDate(config.name, currentVersion, latestVersion));
      } else if (status === VersionComparisonStatus.AHEAD_OF_LATEST) {
        logger.info(messages.toolAheadOfLatest(config.name, currentVersion, latestVersion));
      } else {
        logger.warn(messages.toolVersionComparisonFailed(config.name, currentVersion, latestVersion));
      }
    }
  }
}

export function registerCheckUpdatesCommand(
  parentLogger: TsLogger,
  program: GlobalProgram,
  servicesFactory: () => Promise<Services>
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerCheckUpdatesCommand' });
  program
    .command('check-updates [toolName]')
    .description('Checks for available updates for configured tools. If [toolName] is provided, checks only that tool.')
    .action(async (toolName: string | undefined) => {
      logger.debug(messages.commandActionCalled('check-updates'));

      try {
        const services = await servicesFactory();
        await checkUpdatesActionLogic(logger, toolName, services);
      } catch (error) {
        logger.error(messages.commandExecutionFailed('check-updates', ExitCode.ERROR), error);
        exitCli(ExitCode.ERROR);
      }
    });
}
