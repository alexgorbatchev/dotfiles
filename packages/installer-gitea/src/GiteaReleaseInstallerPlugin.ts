import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type {
  IInstallContext,
  IInstallerPlugin,
  IInstallOptions,
  InstallResult,
  IUpdateOptions,
  UpdateCheckResult,
  UpdateResult,
} from '@dotfiles/core';
import type { ICache, IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor } from '@dotfiles/installer';
import { createToolFileSystem } from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import { stripVersionPrefix } from '@dotfiles/utils';
import { GiteaApiClient } from './gitea-client';
import type { IGiteaApiClient } from './gitea-client';
import { fetchGiteaRelease, installFromGiteaRelease } from './installFromGiteaRelease';
import { messages } from './log-messages';
import {
  type GiteaReleaseInstallParams,
  giteaReleaseInstallParamsSchema,
  type GiteaReleaseToolConfig,
  giteaReleaseToolConfigSchema,
} from './schemas';
import type { IGiteaReleaseInstallMetadata } from './types';

/**
 * Installer plugin for tools distributed via Gitea/Forgejo releases.
 *
 * Supports any Gitea-compatible instance (Gitea, Forgejo, Codeberg, etc.).
 * Each tool configuration specifies the instance URL, allowing tools from
 * different instances to be managed together.
 *
 * **Key Features:**
 * - Automatic asset selection based on platform and architecture
 * - Support for versioned releases and "latest" tag
 * - Automatic archive extraction for compressed releases
 * - Direct binary downloads for standalone executables
 * - Update checking via Gitea API
 * - Per-tool instance URL configuration
 * - Built-in API response caching
 */
export class GiteaReleaseInstallerPlugin implements
  IInstallerPlugin<
    'gitea-release',
    GiteaReleaseInstallParams,
    GiteaReleaseToolConfig,
    IGiteaReleaseInstallMetadata
  >
{
  public readonly method = 'gitea-release' as const;
  public readonly displayName = 'Gitea Release';
  public readonly version = '1.0.0';

  public readonly paramsSchema = giteaReleaseInstallParamsSchema;
  public readonly toolConfigSchema = giteaReleaseToolConfigSchema;

  constructor(
    private readonly fs: IFileSystem,
    private readonly downloader: IDownloader,
    private readonly archiveExtractor: IArchiveExtractor,
    private readonly hookExecutor: HookExecutor,
    private readonly cache?: ICache,
  ) {}

  /**
   * Creates a Gitea API client for the given tool configuration.
   * Each tool can point to a different Gitea instance.
   */
  private createApiClient(toolConfig: GiteaReleaseToolConfig, logger: TsLogger): IGiteaApiClient {
    const params = toolConfig.installParams as GiteaReleaseInstallParams;
    return new GiteaApiClient(
      logger,
      params.instanceUrl,
      this.downloader,
      this.cache,
      { token: params.token },
    );
  }

  async install(
    toolName: string,
    toolConfig: GiteaReleaseToolConfig,
    context: IInstallContext,
    options: IInstallOptions | undefined,
    logger: TsLogger,
  ): Promise<InstallResult<IGiteaReleaseInstallMetadata>> {
    const toolFs = createToolFileSystem(this.fs, toolName);
    const apiClient = this.createApiClient(toolConfig, logger);

    const result = await installFromGiteaRelease(
      toolName,
      toolConfig,
      context,
      options,
      toolFs,
      this.downloader,
      apiClient,
      this.archiveExtractor,
      this.hookExecutor,
      logger,
    );

    return result;
  }

  async resolveVersion(
    toolName: string,
    toolConfig: GiteaReleaseToolConfig,
    _context: IInstallContext,
    logger: TsLogger,
  ): Promise<string | null> {
    try {
      const params = toolConfig.installParams as GiteaReleaseInstallParams;
      const version: string = toolConfig.version || 'latest';
      const apiClient = this.createApiClient(toolConfig, logger);

      const releaseResult = await fetchGiteaRelease(
        params.repo,
        version,
        params.prerelease ?? false,
        apiClient,
        logger,
      );

      if (!releaseResult.success) {
        logger.debug(messages.versionResolutionFailed(toolName, releaseResult.error));
        return null;
      }

      const normalizedVersion: string = stripVersionPrefix(releaseResult.data.tag_name);
      logger.debug(messages.versionResolutionResolved(toolName, normalizedVersion));
      return normalizedVersion;
    } catch (error) {
      logger.debug(messages.versionResolutionException(toolName), error);
      return null;
    }
  }

  supportsUpdateCheck(): boolean {
    return true;
  }

  async checkUpdate(
    toolName: string,
    toolConfig: GiteaReleaseToolConfig,
    _context: IInstallContext,
    logger: TsLogger,
  ): Promise<UpdateCheckResult> {
    try {
      const params = toolConfig.installParams as GiteaReleaseInstallParams;
      const repo = params.repo;
      const [owner, repoName] = repo.split('/');

      if (!owner || !repoName) {
        const result: UpdateCheckResult = {
          success: false,
          error: `Invalid repo format: ${repo}. Expected owner/repo`,
        };
        return result;
      }

      const apiClient = this.createApiClient(toolConfig, logger);
      const latestRelease = await apiClient.getLatestRelease(owner, repoName);
      if (!latestRelease || !latestRelease.tag_name) {
        const result: UpdateCheckResult = {
          success: false,
          error: `Could not fetch latest release for ${toolName}`,
        };
        return result;
      }

      const configuredVersion = toolConfig.version || 'latest';
      const latestVersion = latestRelease.tag_name.replace(/^v/, '');

      if (configuredVersion === 'latest') {
        const result: UpdateCheckResult = {
          success: true,
          hasUpdate: false,
          currentVersion: latestVersion,
          latestVersion,
        };
        return result;
      }

      const result: UpdateCheckResult = {
        success: true,
        hasUpdate: configuredVersion !== latestVersion,
        currentVersion: configuredVersion,
        latestVersion,
      };
      return result;
    } catch (error) {
      logger.error(messages.updateCheckFailed(toolName), error);
      const result: UpdateCheckResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      return result;
    }
  }

  supportsUpdate(): boolean {
    return true;
  }

  async updateTool(
    toolName: string,
    toolConfig: GiteaReleaseToolConfig,
    context: IInstallContext,
    options: IUpdateOptions,
    logger: TsLogger,
  ): Promise<UpdateResult> {
    try {
      const params = toolConfig.installParams as GiteaReleaseInstallParams;
      const repo = params.repo;
      const [owner, repoName] = repo.split('/');

      if (!owner || !repoName) {
        return {
          success: false,
          error: `Invalid repo format: ${repo}. Expected owner/repo`,
        };
      }

      const apiClient = this.createApiClient(toolConfig, logger);
      const latestRelease = await apiClient.getLatestRelease(owner, repoName);
      if (!latestRelease || !latestRelease.tag_name) {
        return {
          success: false,
          error: `Could not fetch latest release for ${toolName}`,
        };
      }

      const oldVersion = params.version || toolConfig.version || 'latest';
      const newVersion = options.targetVersion || latestRelease.tag_name.replace(/^v/, '');

      const updatedConfig: GiteaReleaseToolConfig = {
        ...toolConfig,
        version: newVersion,
        installParams: {
          ...toolConfig.installParams,
          version: newVersion,
        },
      };

      const installResult = await this.install(
        toolName,
        updatedConfig,
        context,
        { force: options.force || true },
        logger,
      );

      if (installResult.success) {
        const result: UpdateResult = {
          success: true,
          oldVersion,
          newVersion,
        };
        return result;
      }
      const result: UpdateResult = {
        success: false,
        error: installResult.error,
      };
      return result;
    } catch (error) {
      logger.error(messages.updateFailed(toolName), error);
      const result: UpdateResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      return result;
    }
  }

  supportsReadme(): boolean {
    return true;
  }

  getReadmeUrl(_toolName: string, toolConfig: GiteaReleaseToolConfig): string | null {
    const params = toolConfig.installParams as GiteaReleaseInstallParams;
    const repo = params.repo;
    const [owner, repoName] = repo.split('/');

    if (!owner || !repoName) {
      return null;
    }

    const instanceUrl = params.instanceUrl.replace(/\/+$/, '');
    const branch = toolConfig.version || 'main';
    return `${instanceUrl}/${owner}/${repoName}/raw/branch/${branch}/README.md`;
  }
}
