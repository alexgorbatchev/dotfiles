import type { GlobalProgram, Services } from '@cli';
import type { YamlConfig } from '@modules/config';
import { loadSingleToolConfig } from '@modules/config-loader';
import type { IFileSystem } from '@modules/file-system';
import type { IInstaller } from '@modules/installer';
import type { GitHubRelease, IGitHubApiClient } from '@modules/installer/clients/github';
import type { TsLogger } from '@modules/logger';
import { VersionComparisonStatus } from '@modules/version-checker';
import type { GithubReleaseInstallParams, ToolConfig } from '@types';
import { ExitCode, exitCli } from './exitCli';
import { cliLogMessages } from './log-messages';

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
    logger.debug(cliLogMessages.commandErrorDetails(), toolName);

    if (!toolConfig) {
      logger.debug(cliLogMessages.commandErrorDetails(), toolName);
      logger.error(cliLogMessages.toolNotFound(toolName, toolConfigsDir));
      return { toolConfig: null, exitCode: ExitCode.ERROR };
    }

    return { toolConfig, exitCode: ExitCode.SUCCESS };
  } catch (error) {
    logger.debug(cliLogMessages.commandErrorDetails(), toolName, (error as Error).message);
    logger.error(cliLogMessages.configLoadFailed(`tool "${toolName}"`, (error as Error).message));
    logger.debug(cliLogMessages.commandErrorDetails(), error);
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
      logger.warn(cliLogMessages.serviceGithubResourceNotFound('release', `${toolName} from ${owner}/${repo}`));
      return null;
    }

    return latestRelease;
  } catch (networkError) {
    logger.error(cliLogMessages.serviceGithubApiFailed('get latest release', 0, (networkError as Error).message));
    logger.debug(cliLogMessages.commandErrorDetails(), networkError);
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
      cliLogMessages.configParameterIgnored(
        'repo',
        `Tool "${toolName}" is 'github-release' but missing 'repo' parameter`
      )
    );
    return null;
  }

  const [owner, repo] = githubParams.repo.split('/');
  if (!owner || !repo) {
    logger.warn(cliLogMessages.configParameterInvalid('repo format', githubParams.repo, 'owner/repo'));
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
      logger.info(cliLogMessages.toolShimUpToDate(toolName, latestVersion));
    } else {
      logger.info(cliLogMessages.toolUpToDate(toolName, configuredVersion, latestVersion));
    }
  } else if (
    status === VersionComparisonStatus.AHEAD_OF_LATEST ||
    status === VersionComparisonStatus.INVALID_CURRENT_VERSION ||
    status === VersionComparisonStatus.INVALID_LATEST_VERSION
  ) {
    logger.warn(cliLogMessages.toolVersionComparisonFailed(toolName, configuredVersion, latestVersion));
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
    logger.info(cliLogMessages.toolShimUpdateStarting(toolName, configuredVersion, latestVersion));
  } else {
    logger.info(cliLogMessages.toolUpdateAvailable(toolName, configuredVersion, latestVersion));
    logger.info(cliLogMessages.toolProcessingUpdate(toolName, configuredVersion, latestVersion));
  }

  const toolConfigForUpdate: ToolConfig = {
    ...toolConfig,
    version: latestVersion,
  };
  const installResult = await installer.install(toolName, toolConfigForUpdate, { force: true });

  if (installResult.success) {
    if (shimMode) {
      logger.info(cliLogMessages.toolShimUpdateSuccess(toolName, latestVersion));
    } else {
      logger.info(cliLogMessages.toolUpdated(toolName, configuredVersion, latestVersion));
    }
    logger.debug(cliLogMessages.commandErrorDetails());
    return ExitCode.SUCCESS;
  } else {
    logger.error(cliLogMessages.toolUpdateFailed(toolName, installResult.error ?? 'Unknown error'));
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
      logger.info(cliLogMessages.toolShimOnLatest(toolName, latestVersion));
    } else {
      logger.info(cliLogMessages.toolConfiguredToLatest(toolName, latestVersion));
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
      actionLogger.debug(cliLogMessages.commandErrorDetails(), toolName, combinedOptions);

      const services = await servicesFactory();
      const { yamlConfig, fs } = services;

      try {
        actionLogger.debug(cliLogMessages.commandErrorDetails(), toolName);

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
          logger.error(cliLogMessages.toolNotFound(toolName, yamlConfig.paths.toolConfigsDir));
          exitCli(ExitCode.ERROR);
          return;
        }

        const toolConfig = toolConfigResult.toolConfig;

        if (!combinedOptions.shimMode) {
          logger.info(cliLogMessages.commandCheckingUpdatesFor(toolName));
        }

        if (toolConfig.installationMethod === 'github-release') {
          await handleGitHubReleaseUpdate(logger, services, toolName, toolConfig, combinedOptions.shimMode);
        } else {
          logger.info(
            cliLogMessages.commandUnsupportedOperation(
              'Update',
              `installation method: "${toolConfig.installationMethod}" for tool "${toolName}"`
            )
          );
        }
      } catch (error) {
        actionLogger.debug(cliLogMessages.commandErrorDetails(), error);
        logger.error(cliLogMessages.commandExecutionFailed('update', ExitCode.ERROR, (error as Error).message));
        logger.debug(cliLogMessages.commandErrorDetails(), error);
        exitCli(ExitCode.ERROR);
      }
    });
}
