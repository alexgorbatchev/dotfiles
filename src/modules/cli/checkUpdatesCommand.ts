import type { GlobalProgram, Services } from '@cli';
import type { YamlConfig } from '@modules/config';
import { loadToolConfigs as loadAllToolConfigs, loadSingleToolConfig } from '@modules/config-loader';
import type { IFileSystem } from '@modules/file-system';
import type { IGitHubApiClient } from '@modules/installer/clients/github';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import type { IVersionChecker } from '@modules/version-checker';
import { VersionComparisonStatus } from '@modules/version-checker';
import type { GithubReleaseInstallParams, ToolConfig } from '@types';
import { ExitCode, exitCli } from './exitCli';

export interface CheckUpdatesCommandOptions {
  verbose?: boolean;
  quiet?: boolean;
}

async function loadToolConfigs(
  logger: TsLogger,
  toolName: string | undefined,
  yamlConfig: YamlConfig,
  fs: IFileSystem
): Promise<{ toolConfigs: Record<string, ToolConfig>; specificToolNotFound: boolean; exitCode: ExitCode }> {
  let toolConfigs: Record<string, ToolConfig> = {};
  let specificToolNotFound = false;

  try {
    if (toolName) {
      const config = await loadSingleToolConfig(logger, toolName, yamlConfig.paths.toolConfigsDir, fs, yamlConfig);
      if (config) {
        toolConfigs[toolName] = config;
      } else {
        specificToolNotFound = true;
        logger.error(logs.tool.error.notFound(toolName, yamlConfig.paths.toolConfigsDir));
      }
    } else {
      toolConfigs = await loadAllToolConfigs(logger, yamlConfig.paths.toolConfigsDir, fs, yamlConfig);
      if (Object.keys(toolConfigs).length === 0) {
        logger.info(logs.general.success.noToolsFound(yamlConfig.paths.toolConfigsDir));
        return { toolConfigs: {}, specificToolNotFound: false, exitCode: ExitCode.SUCCESS };
      }
    }
  } catch (error) {
    logger.error(logs.config.error.loadFailed('tool configurations', (error as Error).message));
    logger.debug(logs.command.debug.configErrorDetails(), error);
    return { toolConfigs: {}, specificToolNotFound: false, exitCode: ExitCode.ERROR };
  }

  return { toolConfigs, specificToolNotFound, exitCode: ExitCode.SUCCESS };
}

function validateGitHubRepoConfig(logger: TsLogger, config: ToolConfig): { owner: string; repo: string } | null {
  if (config.installationMethod !== 'github-release') {
    return null;
  }

  const githubParams = config.installParams as GithubReleaseInstallParams;
  if (!githubParams?.repo) {
    logger.warn(
      logs.config.warning.ignored('repo', `Tool "${config.name}" is 'github-release' but missing 'repo' parameter`)
    );
    return null;
  }

  const [owner, repoName] = githubParams.repo.split('/');
  if (!owner || !repoName) {
    logger.warn(logs.config.warning.invalid('repo format', githubParams.repo, 'owner/repo'));
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
      logger.warn(logs.service.warning.github.notFound('release', `${config.name} latest release`));
      return;
    }

    const latestVersion = latestRelease.tag_name.replace(/^v/, ''); // Remove 'v' prefix if present
    logger.debug(logs.command.debug.versionComparisonDebug(config.name, configuredVersion, latestVersion));

    if (configuredVersion.toLowerCase() === 'latest') {
      logger.info(logs.general.success.toolOnLatest(config.name, latestVersion));
    } else {
      await compareVersions(logger, config, configuredVersion, latestVersion, versionChecker);
    }
  } catch (error) {
    logger.error(logs.service.error.github.apiFailed('get latest release', 0, (error as Error).message));
    logger.debug(logs.command.debug.githubApiError(config.name), error);
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
    logger.info(logs.general.success.updateAvailable(config.name, currentVersionToCompare, latestVersion));
  } else if (status === VersionComparisonStatus.UP_TO_DATE) {
    logger.info(logs.general.success.toolUpToDate(config.name, currentVersionToCompare, latestVersion));
  } else if (status === VersionComparisonStatus.AHEAD_OF_LATEST) {
    logger.info(logs.general.success.toolAhead(config.name, currentVersionToCompare, latestVersion));
  } else {
    logger.warn(logs.tool.warning.versionComparisonFailed(config.name, currentVersionToCompare, latestVersion));
  }
}

export async function checkUpdatesActionLogic(
  parentLogger: TsLogger,
  toolName: string | undefined,
  services: Services
): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: 'checkUpdatesActionLogic' });
  const { yamlConfig, fs, versionChecker, githubApiClient } = services;

  logger.trace(logs.command.debug.actionStarted('check-updates', toolName || 'all'));

  const { toolConfigs, specificToolNotFound, exitCode } = await loadToolConfigs(logger, toolName, yamlConfig, fs);

  if (exitCode !== ExitCode.SUCCESS) {
    exitCli(exitCode);
    return;
  }

  if (specificToolNotFound) {
    exitCli(ExitCode.ERROR);
    return;
  }

  if (Object.keys(toolConfigs).length === 0) {
    return;
  }

  for (const config of Object.values(toolConfigs)) {
    logger.info(logs.general.success.checkingUpdates(config.name));

    if (config.installationMethod === 'github-release') {
      await checkGitHubReleaseUpdate(logger, config, githubApiClient, versionChecker);
    } else {
      logger.warn(
        logs.general.warning.unsupportedOperation(
          `Update checking for ${config.name}`,
          `method: ${config.installationMethod}`
        )
      );
    }
  }

  logger.info(logs.general.success.completed('Check-updates command'));
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
    .action(async (toolName, options) => {
      const combinedOptions = { ...options, ...program.opts() };

      logger.debug(logs.command.debug.actionCalled('check-updates', toolName || 'all'), combinedOptions);
      try {
        const services = await servicesFactory();
        await checkUpdatesActionLogic(logger, toolName, services);
      } catch (error) {
        logger.debug(logs.command.debug.unhandledError(), error);
        logger.error(logs.command.error.executionFailed('check-updates', ExitCode.ERROR, (error as Error).message));
        logger.debug(logs.command.debug.errorDetails(), error);
        exitCli(ExitCode.ERROR);
      }
    });
}
