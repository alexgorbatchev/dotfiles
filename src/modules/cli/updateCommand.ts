import type { GlobalProgram, Services } from '@cli';
import type { YamlConfig } from '@modules/config';
import { loadSingleToolConfig } from '@modules/config-loader';
import type { IFileSystem } from '@modules/file-system';
import type { GitHubRelease, IGitHubApiClient } from '@modules/github-client';
import type { IInstaller } from '@modules/installer';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import { VersionComparisonStatus } from '@modules/version-checker';
import type { GithubReleaseInstallParams, ToolConfig } from '@types';
import { ExitCode, exitCli } from './exitCli';

export interface UpdateCommandOptions {
  yes?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  shimMode?: boolean;
}

async function loadToolConfigSafely(
  logger: TsLogger,
  toolName: string,
  toolConfigsDir: string,
  fs: IFileSystem,
  yamlConfig: YamlConfig
): Promise<{ toolConfig: ToolConfig | null; exitCode: ExitCode }> {
  try {
    const toolConfig = await loadSingleToolConfig(logger, toolName, toolConfigsDir, fs, yamlConfig);
    logger.debug(logs.command.debug.errorDetails(), toolName);

    if (!toolConfig) {
      logger.debug(logs.command.debug.errorDetails(), toolName);
      logger.error(logs.tool.error.notFound(toolName, toolConfigsDir));
      return { toolConfig: null, exitCode: ExitCode.ERROR };
    }

    return { toolConfig, exitCode: ExitCode.SUCCESS };
  } catch (error) {
    logger.debug(logs.command.debug.errorDetails(), toolName, (error as Error).message);
    logger.error(logs.config.error.loadFailed(`tool "${toolName}"`, (error as Error).message));
    logger.debug(logs.command.debug.errorDetails(), error);
    return { toolConfig: null, exitCode: ExitCode.ERROR };
  }
}

async function getLatestReleaseFromGitHub(
  logger: TsLogger,
  githubApiClient: IGitHubApiClient,
  owner: string,
  repo: string,
  toolName: string
): Promise<GitHubRelease | null> {
  try {
    const latestRelease = await githubApiClient.getLatestRelease(owner, repo);

    if (!latestRelease) {
      logger.warn(logs.service.warning.github.notFound('release', `${toolName} from ${owner}/${repo}`));
      return null;
    }

    return latestRelease;
  } catch (networkError) {
    logger.error(logs.service.error.github.apiFailed('get latest release', 0, (networkError as Error).message));
    logger.debug(logs.command.debug.errorDetails(), networkError);
    return null;
  }
}

function validateGitHubRepo(
  logger: TsLogger,
  toolName: string,
  toolConfig: ToolConfig
): { owner: string; repo: string } | null {
  if (toolConfig.installationMethod !== 'github-release') {
    return null;
  }

  const githubParams = toolConfig.installParams as GithubReleaseInstallParams;
  if (!githubParams?.repo) {
    logger.warn(
      logs.config.warning.ignored('repo', `Tool "${toolName}" is 'github-release' but missing 'repo' parameter`)
    );
    return null;
  }

  const [owner, repo] = githubParams.repo.split('/');
  if (!owner || !repo) {
    logger.warn(logs.config.warning.invalid('repo format', githubParams.repo, 'owner/repo'));
    return null;
  }

  return { owner, repo };
}

function logUpdateStatus(
  logger: TsLogger,
  status: VersionComparisonStatus,
  toolName: string,
  configuredVersion: string,
  latestVersion: string,
  shimMode: boolean
): void {
  if (status === VersionComparisonStatus.UP_TO_DATE) {
    if (shimMode) {
      logger.info(logs.general.success.shimToolUpToDate(toolName, latestVersion));
    } else {
      logger.info(logs.general.success.toolUpToDate(toolName, configuredVersion, latestVersion));
    }
  } else if (
    status === VersionComparisonStatus.AHEAD_OF_LATEST ||
    status === VersionComparisonStatus.INVALID_CURRENT_VERSION ||
    status === VersionComparisonStatus.INVALID_LATEST_VERSION
  ) {
    logger.warn(logs.tool.warning.versionComparisonFailed(toolName, configuredVersion, latestVersion));
  }
}

async function performUpdate(
  logger: TsLogger,
  installer: IInstaller,
  toolName: string,
  toolConfig: ToolConfig,
  latestVersion: string,
  configuredVersion: string,
  shimMode: boolean
): Promise<ExitCode> {
  if (shimMode) {
    logger.info(logs.general.success.shimUpdateStarting(toolName, configuredVersion, latestVersion));
  } else {
    logger.info(logs.general.success.updateAvailable(toolName, configuredVersion, latestVersion));
    logger.info(logs.general.success.processingUpdate(toolName, configuredVersion, latestVersion));
  }

  const toolConfigForUpdate: ToolConfig = {
    ...toolConfig,
    version: latestVersion,
  };
  const installResult = await installer.install(toolName, toolConfigForUpdate, { force: true });

  if (installResult.success) {
    if (shimMode) {
      logger.info(logs.general.success.shimUpdateSuccess(toolName, latestVersion));
    } else {
      logger.info(logs.tool.success.updated(toolName, configuredVersion, latestVersion));
    }
    logger.debug(logs.command.debug.errorDetails());
    return ExitCode.SUCCESS;
  } else {
    logger.error(logs.tool.error.updateFailed(toolName, installResult.error || 'Unknown error'));
    return ExitCode.ERROR;
  }
}

async function handleGitHubReleaseUpdate(
  logger: TsLogger,
  services: Services,
  toolName: string,
  toolConfig: ToolConfig,
  shimMode: boolean
): Promise<void> {
  const repoInfo = validateGitHubRepo(logger, toolName, toolConfig);
  if (!repoInfo) return;

  const { owner, repo } = repoInfo;
  const latestRelease = await getLatestReleaseFromGitHub(logger, services.githubApiClient, owner, repo, toolName);
  if (!latestRelease) return;

  const latestVersion = latestRelease.tag_name.replace(/^v/, ''); // Normalize tag
  const configuredVersion = toolConfig.version || 'latest';

  if (configuredVersion === 'latest') {
    if (shimMode) {
      logger.info(logs.general.success.shimToolOnLatest(toolName, latestVersion));
    } else {
      logger.info(logs.general.success.toolOnLatest(toolName, latestVersion));
    }
    return;
  }

  const status = await services.versionChecker.checkVersionStatus(configuredVersion, latestVersion);

  if (status === VersionComparisonStatus.NEWER_AVAILABLE) {
    const updateExitCode = await performUpdate(
      logger,
      services.installer,
      toolName,
      toolConfig,
      latestVersion,
      configuredVersion,
      shimMode
    );
    if (updateExitCode !== ExitCode.SUCCESS) {
      exitCli(updateExitCode);
    }
  } else {
    logUpdateStatus(logger, status, toolName, configuredVersion, latestVersion, shimMode);
  }
}

export function registerUpdateCommand(
  parentLogger: TsLogger,
  program: GlobalProgram,
  servicesFactory: () => Promise<Services>
): void {
  const logger = parentLogger.getSubLogger({ name: 'updateCommand' });
  program
    .command('update <toolName>')
    .description('Updates a specified tool to its latest version.')
    .option('-y, --yes', 'Automatically confirm updates', false)
    .option('--shim-mode', 'Run in shim mode with minimal output', false)
    .action(async (toolName, options) => {
      const actionLogger = logger.getSubLogger({ name: 'action' });
      const combinedOptions = { ...options, ...program.opts() };
      actionLogger.debug(logs.command.debug.errorDetails(), toolName, combinedOptions);

      const services = await servicesFactory();
      const { yamlConfig, fs } = services;

      try {
        actionLogger.debug(logs.command.debug.errorDetails(), toolName);

        const toolConfigResult = await loadToolConfigSafely(
          actionLogger,
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
          logger.error(logs.tool.error.notFound(toolName, yamlConfig.paths.toolConfigsDir));
          exitCli(ExitCode.ERROR);
          return;
        }

        const toolConfig = toolConfigResult.toolConfig;

        if (!combinedOptions.shimMode) {
          logger.info(logs.general.success.checkingUpdatesFor(toolName));
        }

        if (toolConfig.installationMethod === 'github-release') {
          await handleGitHubReleaseUpdate(logger, services, toolName, toolConfig, combinedOptions.shimMode);
        } else {
          logger.info(
            logs.general.warning.unsupportedOperation(
              'Update',
              `installation method: "${toolConfig.installationMethod}" for tool "${toolName}"`
            )
          );
        }
      } catch (error) {
        actionLogger.debug(logs.command.debug.errorDetails(), error);
        logger.error(logs.command.error.executionFailed('update', ExitCode.ERROR, (error as Error).message));
        logger.debug(logs.command.debug.errorDetails(), error);
        exitCli(ExitCode.ERROR);
      }
    });
}
