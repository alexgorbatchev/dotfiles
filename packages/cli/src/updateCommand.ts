import type { IConfigService, YamlConfig } from '@dotfiles/config';
import type { IFileSystem } from '@dotfiles/file-system';
import type { IInstaller } from '@dotfiles/installer';
import type { IGitHubApiClient } from '@dotfiles/installer/clients/github';
import type { TsLogger } from '@dotfiles/logger';
import type { GitHubRelease, GithubReleaseInstallParams, ToolConfig } from '@dotfiles/schemas';
import { ExitCode, exitCli } from '@dotfiles/utils';
import { VersionComparisonStatus } from '@dotfiles/version-checker';
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
      logger.warn(messages.serviceGithubResourceNotFound('release', `${toolName} from ${owner}/${repo}`));
      return null;
    }

    return latestRelease;
  } catch (networkError: unknown) {
    logger.error(messages.serviceGithubApiFailed('get latest release', 0), networkError);
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
      messages.configParameterIgnored('repo', `Tool "${toolName}" is 'github-release' but missing 'repo' parameter`)
    );
    return null;
  }

  const [owner, repo] = githubParams.repo.split('/');
  if (!owner || !repo) {
    logger.warn(messages.configParameterInvalid('repo format', githubParams.repo, 'owner/repo'));
    return null;
  }

  return { owner, repo };
}

function logUpdateStatus(
  logger: TsLogger,
  status: VersionComparisonStatus,
  toolName: string,
  configuredVersion: string | undefined,
  latestVersion: string,
  shimMode: boolean
): void {
  if (status === VersionComparisonStatus.UP_TO_DATE) {
    if (shimMode) {
      logger.info(messages.toolShimUpToDate(toolName, latestVersion));
    } else {
      logger.info(messages.toolUpToDate(toolName, configuredVersion || 'unknown', latestVersion));
    }
  } else if (
    status === VersionComparisonStatus.AHEAD_OF_LATEST ||
    status === VersionComparisonStatus.INVALID_CURRENT_VERSION ||
    status === VersionComparisonStatus.INVALID_LATEST_VERSION
  ) {
    logger.warn(messages.toolVersionComparisonFailed(toolName, configuredVersion || 'unknown', latestVersion));
  }
}

async function performStandardUpdate(
  logger: TsLogger,
  installer: IInstaller,
  toolName: string,
  toolConfig: ToolConfig,
  latestVersion: string,
  configuredVersion: string
): Promise<ExitCode> {
  logger.info(messages.toolUpdateAvailable(toolName, configuredVersion, latestVersion));
  logger.info(messages.toolProcessingUpdate(toolName, configuredVersion, latestVersion));

  const toolConfigForUpdate: ToolConfig = {
    ...toolConfig,
    version: latestVersion,
  };
  const installResult = await installer.install(toolName, toolConfigForUpdate, { force: true });

  if (installResult.success) {
    logger.info(messages.toolUpdated(toolName, configuredVersion, latestVersion));
    return ExitCode.SUCCESS;
  } else {
    logger.error(messages.toolUpdateFailed(toolName, installResult.error ?? 'Unknown error'));
    return ExitCode.ERROR;
  }
}

async function performShimUpdate(
  logger: TsLogger,
  installer: IInstaller,
  toolName: string,
  toolConfig: ToolConfig,
  latestVersion: string,
  configuredVersion: string
): Promise<ExitCode> {
  logger.info(messages.toolShimUpdateStarting(toolName, configuredVersion, latestVersion));

  const toolConfigForUpdate: ToolConfig = {
    ...toolConfig,
    version: latestVersion,
  };
  const installResult = await installer.install(toolName, toolConfigForUpdate, { force: true });

  if (installResult.success) {
    logger.info(messages.toolShimUpdateSuccess(toolName, latestVersion));
    return ExitCode.SUCCESS;
  } else {
    logger.error(messages.toolUpdateFailed(toolName, installResult.error ?? 'Unknown error'));
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
    // Even if configured to 'latest', we still need to install/update to ensure latest version is installed
    if (shimMode) {
      logger.info(messages.toolShimOnLatest(toolName, latestVersion));
    } else {
      logger.info(messages.toolConfiguredToLatest(toolName, latestVersion));
    }
    const updateExitCode = shimMode
      ? await performShimUpdate(logger, services.installer, toolName, toolConfig, latestVersion, latestVersion)
      : await performStandardUpdate(logger, services.installer, toolName, toolConfig, latestVersion, latestVersion);
    if (updateExitCode !== ExitCode.SUCCESS) {
      exitCli(updateExitCode);
    }
    return;
  }

  const status = await services.versionChecker.checkVersionStatus(configuredVersion, latestVersion);

  if (status === VersionComparisonStatus.NEWER_AVAILABLE) {
    const updateExitCode = shimMode
      ? await performShimUpdate(logger, services.installer, toolName, toolConfig, latestVersion, configuredVersion)
      : await performStandardUpdate(logger, services.installer, toolName, toolConfig, latestVersion, configuredVersion);
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

        if (toolConfig.installationMethod === 'github-release') {
          await handleGitHubReleaseUpdate(logger, services, toolName, toolConfig, combinedOptions.shimMode);
        } else {
          logger.info(
            messages.commandUnsupportedOperation(
              'Update',
              `installation method: "${toolConfig.installationMethod}" for tool "${toolName}"`
            )
          );
        }
      } catch (error) {
        logger.error(messages.commandExecutionFailed('update', ExitCode.ERROR), error);
        exitCli(ExitCode.ERROR);
      }
    });
}
