import type { IConfigService, YamlConfig } from '@dotfiles/config';
import type { IFileSystem } from '@dotfiles/file-system';
import type { IGitHubApiClient } from '@dotfiles/installer/clients/github';
import type { TsLogger } from '@dotfiles/logger';
import type { GithubReleaseInstallParams, ToolConfig } from '@dotfiles/schemas';
import { ExitCode, exitCli } from '@dotfiles/utils';
import type { IVersionChecker } from '@dotfiles/version-checker';
import { VersionComparisonStatus } from '@dotfiles/version-checker';
import { cliLogMessages } from './log-messages';
import type { GlobalProgram, Services } from './types';

export interface CheckUpdatesCommandOptions {
  verbose: boolean;
  quiet: boolean;
  dryRun: boolean;
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
    logger.debug(cliLogMessages.commandErrorDetails(), toolName);
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
        logger.error(cliLogMessages.toolNotFound(toolName, yamlConfig.paths.toolConfigsDir));
        return null;
      }
    } catch (error) {
      logger.error(cliLogMessages.configLoadFailed(`tool "${toolName}"`, (error as Error).message));
      return null;
    }
  } else {
    try {
      toolConfigs = await configService.loadToolConfigs(logger, yamlConfig.paths.toolConfigsDir, fs, yamlConfig);
      if (Object.keys(toolConfigs).length === 0) {
        logger.error(cliLogMessages.toolNoConfigurationsFound(yamlConfig.paths.toolConfigsDir));
        return null;
      }
    } catch (error) {
      logger.error(cliLogMessages.configLoadFailed('tool configurations', (error as Error).message));
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
  if (!githubParams?.repo) {
    logger.error(cliLogMessages.configParameterInvalid('repo', 'undefined', 'owner/repo format'));
    return null;
  }

  const [owner, repoName] = githubParams.repo.split('/');
  if (!owner || !repoName) {
    logger.error(cliLogMessages.configParameterInvalid('repo', githubParams.repo, 'owner/repo format'));
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
      logger.warn(cliLogMessages.serviceGithubResourceNotFound('release', `${config.name} latest release`));
      return;
    }

    const latestVersion = latestRelease.tag_name.replace(/^v/, ''); // Remove 'v' prefix if present
    logger.debug(cliLogMessages.commandVersionComparison(config.name, configuredVersion, latestVersion));

    if (configuredVersion.toLowerCase() === 'latest') {
      logger.info(cliLogMessages.toolConfiguredToLatest(config.name, latestVersion));
    } else {
      await compareVersions(logger, config, configuredVersion, latestVersion, versionChecker);
    }
  } catch (error) {
    logger.error(cliLogMessages.serviceGithubApiFailed('get latest release', 0, (error as Error).message));
    logger.debug(cliLogMessages.commandGithubApiErrorDetails(config.name), error);
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
    logger.info(cliLogMessages.toolUpdateAvailable(config.name, currentVersionToCompare, latestVersion));
  } else if (status === VersionComparisonStatus.UP_TO_DATE) {
    logger.info(cliLogMessages.toolUpToDate(config.name, currentVersionToCompare, latestVersion));
  } else if (status === VersionComparisonStatus.AHEAD_OF_LATEST) {
    logger.info(cliLogMessages.toolAheadOfLatest(config.name, currentVersionToCompare, latestVersion));
  } else {
    logger.warn(cliLogMessages.toolVersionComparisonFailed(config.name, currentVersionToCompare, latestVersion));
  }
}

export async function checkUpdatesActionLogic(
  logger: TsLogger,
  toolName: string | undefined,
  services: Services
): Promise<void> {
  const { yamlConfig, fs, versionChecker, githubApiClient } = services;

  logger.trace(cliLogMessages.commandActionStarted('check-updates', toolName || 'all'));

  const toolConfigs = await loadToolConfigs(logger, services.configService, toolName, yamlConfig, fs);
  if (!toolConfigs) {
    return;
  }

  if (Object.keys(toolConfigs).length === 0) {
    logger.error(cliLogMessages.toolNoConfigurationsFound(yamlConfig.paths.toolConfigsDir));
    return;
  }

  for (const config of Object.values(toolConfigs)) {
    if (config.installationMethod === 'github-release') {
      await checkGitHubReleaseUpdate(logger, config, githubApiClient, versionChecker);
    } else {
      logger.info(
        cliLogMessages.commandUnsupportedOperation(
          'Check updates',
          `installation method: "${config.installationMethod}" for tool "${config.name}"`
        )
      );
    }
  }

  logger.info(cliLogMessages.updatesCommandCompleted());
}

export function registerCheckUpdatesCommand(
  parentLogger: TsLogger,
  program: GlobalProgram,
  servicesFactory: () => Promise<Services>
): void {
  const logger = parentLogger.getSubLogger({ name: 'checkUpdatesCommand' });
  program
    .command('check-updates [toolName]')
    .description('Checks for available updates for configured tools. If [toolName] is provided, checks only that tool.')
    // biome-ignore lint/suspicious/noExplicitAny: Commander action callback types are not properly typed
    .action(async (toolName: string | undefined, _options: any) => {
      const combinedOptions: CheckUpdatesCommandOptions = {
        ..._options,
        ...program.opts(),
      } as CheckUpdatesCommandOptions;

      logger.debug(cliLogMessages.commandActionCalled('check-updates', toolName || 'all'), combinedOptions);
      try {
        const services = await servicesFactory();
        await checkUpdatesActionLogic(logger, toolName, services);
      } catch (error) {
        logger.debug(cliLogMessages.commandUnhandledError(), error);
        logger.error(cliLogMessages.commandExecutionFailed('check-updates', ExitCode.ERROR, (error as Error).message));
        logger.debug(cliLogMessages.commandErrorDetails(), error);
        exitCli(ExitCode.ERROR);
      }
    });
}
