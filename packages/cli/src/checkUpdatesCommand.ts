import path from 'node:path';
import type { IConfigService, ISystemInfo, ProjectConfig, ToolConfig } from '@dotfiles/config';
import type { IInstallContext } from '@dotfiles/core';
import type { IResolvedFileSystem } from '@dotfiles/file-system';
import { createConfiguredShell } from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import { ExitCode, exitCli, replaceInFile } from '@dotfiles/utils';
import { type IVersionChecker, VersionComparisonStatus } from '@dotfiles/version-checker';
import { $ } from 'bun';
import { messages } from './log-messages';
import type { ICommandCompletionMeta, IGlobalProgram, IServices } from './types';

/**
 * Completion metadata for the check-updates command.
 */
export const CHECK_UPDATES_COMMAND_COMPLETION: ICommandCompletionMeta = {
  name: 'check-updates',
  description: 'Check for available tool updates',
  hasPositionalArg: true,
  positionalArgDescription: 'tool name (optional, checks all if omitted)',
  positionalArgType: 'tool',
};

async function loadToolConfigs(
  logger: TsLogger,
  configService: IConfigService,
  toolName: string | undefined,
  projectConfig: ProjectConfig,
  fs: IResolvedFileSystem,
  systemInfo: ISystemInfo
): Promise<Record<string, ToolConfig> | null> {
  let toolConfigs: Record<string, ToolConfig> = {};
  if (toolName) {
    logger.debug(messages.commandCheckingUpdatesFor(toolName));
    try {
      const config = await configService.loadSingleToolConfig(
        logger,
        toolName,
        projectConfig.paths.toolConfigsDir,
        fs,
        projectConfig,
        systemInfo
      );
      if (config) {
        toolConfigs[toolName] = config;
      } else {
        logger.error(messages.toolNotFound(toolName, projectConfig.paths.toolConfigsDir));
        return null;
      }
    } catch (error) {
      logger.error(messages.configLoadFailed(`tool "${toolName}"`), error);
      return null;
    }
  } else {
    try {
      logger.debug(messages.commandCheckingUpdatesForAll());
      toolConfigs = await configService.loadToolConfigs(
        logger,
        projectConfig.paths.toolConfigsDir,
        fs,
        projectConfig,
        systemInfo
      );
      if (Object.keys(toolConfigs).length === 0) {
        logger.error(messages.toolNoConfigurationsFound(projectConfig.paths.toolConfigsDir));
        return null;
      }
    } catch (error) {
      logger.error(messages.configLoadFailed('tool configurations'), error);
      return null;
    }
  }
  return toolConfigs;
}

function createInstallContext(
  config: ToolConfig,
  projectConfig: ProjectConfig,
  systemInfo: ISystemInfo,
  fs: IResolvedFileSystem
): IInstallContext {
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const toolDir: string = config.configFilePath
    ? path.dirname(config.configFilePath)
    : projectConfig.paths.toolConfigsDir;

  const currentDir: string = path.join(projectConfig.paths.binariesDir, config.name, 'current');

  const context: IInstallContext = {
    toolName: config.name,
    toolDir,
    currentDir,
    stagingDir: '',
    timestamp: timestamp || '',
    systemInfo,
    toolConfig: config,
    projectConfig: projectConfig,
    $: createConfiguredShell($, process.env),
    fileSystem: fs,
    replaceInFile: (filePath, from, to, options) => replaceInFile(fs, filePath, from, to, options),
  };

  return context;
}

async function logVersionStatus(
  logger: TsLogger,
  versionChecker: IVersionChecker,
  config: ToolConfig,
  currentVersion: string,
  latestVersion: string,
  hasUpdate: boolean
): Promise<void> {
  if (currentVersion === 'latest') {
    logger.info(messages.toolConfiguredToLatest(config.name, latestVersion));
    return;
  }

  if (hasUpdate) {
    logger.info(messages.toolUpdateAvailable(config.name, currentVersion, latestVersion));
    return;
  }

  const status = await versionChecker.checkVersionStatus(currentVersion, latestVersion);

  if (status === VersionComparisonStatus.UP_TO_DATE) {
    logger.info(messages.toolUpToDate(config.name, currentVersion, latestVersion));
  } else if (status === VersionComparisonStatus.AHEAD_OF_LATEST) {
    logger.info(messages.toolAheadOfLatest(config.name, currentVersion, latestVersion));
  } else {
    logger.warn(messages.toolVersionComparisonFailed(config.name, currentVersion, latestVersion));
  }
}

async function checkToolUpdate(logger: TsLogger, config: ToolConfig, services: IServices): Promise<void> {
  const { projectConfig, versionChecker, pluginRegistry, systemInfo, fs } = services;

  const context = createInstallContext(config, projectConfig, systemInfo, fs);
  const plugin = pluginRegistry.get(config.installationMethod);

  if (!plugin) {
    logger.warn(
      messages.commandUnsupportedOperation(
        'check-updates',
        `installation method: "${config.installationMethod}" for tool "${config.name}"`
      )
    );
    return;
  }

  if (!plugin.supportsUpdateCheck || !plugin.supportsUpdateCheck()) {
    logger.info(
      messages.commandUnsupportedOperation(
        'check-updates',
        `installation method: "${config.installationMethod}" for tool "${config.name}"`
      )
    );
    return;
  }

  const updateCheckResult = await plugin.checkUpdate?.(config.name, config, context, logger);

  if (!updateCheckResult) {
    logger.warn(messages.commandUnsupportedOperation('check-updates', config.name));
    return;
  }

  if (!updateCheckResult.success) {
    logger.error(messages.serviceGithubApiFailed('check update', 0), new Error(updateCheckResult.error));
    return;
  }

  const currentVersion = updateCheckResult.currentVersion || config.version || 'unknown';
  const latestVersion = updateCheckResult.latestVersion || 'unknown';

  await logVersionStatus(logger, versionChecker, config, currentVersion, latestVersion, updateCheckResult.hasUpdate);
}

export async function checkUpdatesActionLogic(
  logger: TsLogger,
  toolName: string | undefined,
  services: IServices
): Promise<void> {
  logger.trace(messages.commandActionStarted('check-updates', toolName || 'all'));

  const toolConfigs = await loadToolConfigs(
    logger,
    services.configService,
    toolName,
    services.projectConfig,
    services.fs,
    services.systemInfo
  );

  if (!toolConfigs) {
    return;
  }

  for (const config of Object.values(toolConfigs)) {
    await checkToolUpdate(logger, config, services);
  }
}

export function registerCheckUpdatesCommand(
  parentLogger: TsLogger,
  program: IGlobalProgram,
  servicesFactory: () => Promise<IServices>
): void {
  const logger = parentLogger.getSubLogger({ name: 'registerCheckUpdatesCommand' });
  program
    .command('check-updates [toolName]')
    .description('Checks for available updates for configured tools. If [toolName] is provided, checks only that tool.')
    .action(async (toolName: string | undefined) => {
      try {
        const services = await servicesFactory();
        await checkUpdatesActionLogic(logger, toolName, services);
      } catch (error) {
        logger.error(messages.commandExecutionFailed('check-updates', ExitCode.ERROR), error);
        exitCli(ExitCode.ERROR);
      }
    });
}
