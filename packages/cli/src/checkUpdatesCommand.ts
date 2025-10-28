import type { IConfigService, YamlConfig } from '@dotfiles/config';
import type { IFileSystem } from '@dotfiles/file-system';
import type { IGitHubApiClient } from '@dotfiles/installer/clients/github';
import type { TsLogger } from '@dotfiles/logger';
import type { GithubReleaseInstallParams, ToolConfig } from '@dotfiles/schemas';
import { ExitCode, exitCli } from '@dotfiles/utils';
import type { IVersionChecker } from '@dotfiles/version-checker';
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

function validateGitHubRepoConfig(logger: TsLogger, config: ToolConfig): { owner: string; repo: string } | null {
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

async function checkGitHubReleaseUpdate(
  logger: TsLogger,
  config: ToolConfig,
  githubApiClient: IGitHubApiClient,
  versionChecker: IVersionChecker
): Promise<void> {
  const repoInfo = validateGitHubRepoConfig(logger, config);
  if (!repoInfo) return;

  const { owner, repo } = repoInfo;
  const configuredVersion = config.version || 'latest';

  try {
    const latestRelease = await githubApiClient.getLatestRelease(owner, repo);
    if (!latestRelease || !latestRelease.tag_name) {
      logger.warn(messages.serviceGithubResourceNotFound('release', `${config.name} latest release`));
      return;
    }

    const latestVersion = latestRelease.tag_name.replace(/^v/, ''); // Remove 'v' prefix if present
    logger.debug(messages.commandVersionComparison(config.name, configuredVersion, latestVersion));

    if (configuredVersion.toLowerCase() === 'latest') {
      logger.info(messages.toolConfiguredToLatest(config.name, latestVersion));
    } else {
      await compareVersions(logger, config, configuredVersion, latestVersion, versionChecker);
    }
  } catch (error) {
    logger.error(messages.serviceGithubApiFailed('get latest release', 0), error);
  }
}

async function compareVersions(
  logger: TsLogger,
  config: ToolConfig,
  configuredVersion: string,
  latestVersion: string,
  versionChecker: IVersionChecker
): Promise<void> {
  const currentVersionToCompare = configuredVersion.replace(/^v/, '');
  const status = await versionChecker.checkVersionStatus(currentVersionToCompare, latestVersion);

  if (status === VersionComparisonStatus.NEWER_AVAILABLE) {
    logger.info(messages.toolUpdateAvailable(config.name, currentVersionToCompare, latestVersion));
  } else if (status === VersionComparisonStatus.UP_TO_DATE) {
    logger.info(messages.toolUpToDate(config.name, currentVersionToCompare, latestVersion));
  } else if (status === VersionComparisonStatus.AHEAD_OF_LATEST) {
    logger.info(messages.toolAheadOfLatest(config.name, currentVersionToCompare, latestVersion));
  } else {
    logger.warn(messages.toolVersionComparisonFailed(config.name, currentVersionToCompare, latestVersion));
  }
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
      await checkGitHubReleaseUpdate(logger, config, githubApiClient, versionChecker);
    } else {
      logger.info(
        messages.commandUnsupportedOperation(
          'check-updates',
          `installation method: "${config.installationMethod}" for tool "${config.name}"`
        )
      );
    }
  }

  logger.info(messages.updatesCommandCompleted());
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
