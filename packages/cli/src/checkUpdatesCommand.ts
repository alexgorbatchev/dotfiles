import type { IConfigService, YamlConfig } from '@dotfiles/config';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type {
  BrewToolConfig,
  CargoToolConfig,
  GithubReleaseInstallParams,
  GithubReleaseToolConfig,
  ToolConfig,
} from '@dotfiles/schemas';
import { ExitCode, exitCli } from '@dotfiles/utils';
import { messages } from './log-messages';
import type { BaseCommandOptions, GlobalProgram, Services } from './types';
import { checkBrewUpdate, checkCargoUpdate, checkGitHubReleaseUpdate } from './updateCheckers';

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

function _validateGitHubRepoConfig(logger: TsLogger, config: ToolConfig): { owner: string; repo: string } | null {
  if (config.installationMethod !== 'github-release') {
    return null;
  }

  const githubParams = config.installParams as GithubReleaseInstallParams;
  const repo = githubParams?.repo;

  if (!repo) {
    logger.error(messages.configParameterInvalid('repo', 'undefined', 'owner/repo format'));
    return null;
  }

  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) {
    logger.error(messages.configParameterInvalid('repo', repo, 'owner/repo format'));
    return null;
  }

  return { owner, repo: repoName };
}

export async function checkUpdatesActionLogic(
  logger: TsLogger,
  toolName: string | undefined,
  services: Services
): Promise<void> {
  const { yamlConfig, fs, versionChecker, githubApiClient } = services;

  logger.trace(messages.commandActionStarted('check-updates', toolName || 'all'));

  const toolConfigs = await loadToolConfigs(logger, services.configService, toolName, yamlConfig, fs);
  if (!toolConfigs) {
    return;
  }

  for (const config of Object.values(toolConfigs)) {
    if (config.installationMethod === 'github-release') {
      await checkGitHubReleaseUpdate(config as GithubReleaseToolConfig, githubApiClient, versionChecker, logger);
    } else if (config.installationMethod === 'brew') {
      await checkBrewUpdate(config as BrewToolConfig, logger);
    } else if (config.installationMethod === 'cargo') {
      await checkCargoUpdate(config as CargoToolConfig, services.cargoClient, versionChecker, logger);
    } else {
      logger.info(
        messages.commandUnsupportedOperation(
          'check-updates',
          `installation method: "${config.installationMethod}" for tool "${config.name}"`
        )
      );
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
