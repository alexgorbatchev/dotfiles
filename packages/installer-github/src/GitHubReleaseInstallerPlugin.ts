import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { ProjectConfig } from '@dotfiles/config';
import type {
  BaseInstallContext,
  IInstallerPlugin,
  IInstallOptions,
  InstallResult,
  IUpdateOptions,
  UpdateCheckResult,
  UpdateResult,
} from '@dotfiles/core';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor } from '@dotfiles/installer';
import { createToolFileSystem } from '@dotfiles/installer';
import type { TsLogger } from '@dotfiles/logger';
import type { IGitHubApiClient } from './github-client';
import { installFromGitHubRelease } from './installFromGitHubRelease';
import { messages } from './log-messages';
import {
  type GithubReleaseInstallParams,
  type GithubReleaseToolConfig,
  githubReleaseInstallParamsSchema,
  githubReleaseToolConfigSchema,
} from './schemas';
import type { IGitHubReleaseInstallMetadata } from './types';

/**
 * Installer plugin for tools distributed via GitHub Releases.
 *
 * This plugin handles tools that publish release artifacts on GitHub, supporting both
 * archive files (tar.gz, zip) and standalone binaries. It's one of the most commonly
 * used installers as many CLI tools distribute pre-compiled binaries through GitHub.
 *
 * **Key Features:**
 * - Automatic asset selection based on platform (macOS, Linux, Windows) and architecture (x86_64, arm64)
 * - Support for versioned releases and "latest" tag
 * - Automatic archive extraction for compressed releases
 * - Direct binary downloads for standalone executables
 * - Update checking via GitHub API
 * - Release asset pattern matching with glob patterns
 *
 * **Asset Selection:**
 * The plugin intelligently selects the appropriate release asset by:
 * - Matching platform keywords (darwin, linux, windows)
 * - Matching architecture keywords (x86_64, amd64, arm64, aarch64)
 * - Using user-defined patterns when auto-detection isn't sufficient
 * - Falling back to manual asset selection via configuration
 *
 * **Version Management:**
 * - Fetches release metadata from GitHub API
 * - Supports semantic versioning for update detection
 * - Tracks installed versions for update checking
 * - Can install specific versions or latest releases
 */
export class GitHubReleaseInstallerPlugin
  implements
    IInstallerPlugin<
      'github-release',
      GithubReleaseInstallParams,
      GithubReleaseToolConfig,
      IGitHubReleaseInstallMetadata
    >
{
  public readonly method = 'github-release' as const;
  public readonly displayName = 'GitHub Release';
  public readonly version = '1.0.0';

  // Zod schemas for validation
  public readonly paramsSchema = githubReleaseInstallParamsSchema;
  public readonly toolConfigSchema = githubReleaseToolConfigSchema;

  /**
   * Creates a new GitHubReleaseInstallerPlugin instance.
   *
   * @param fs - The file system interface for file operations.
   * @param downloader - The downloader for fetching release assets.
   * @param githubApiClient - The GitHub API client for fetching release metadata.
   * @param archiveExtractor - The archive extractor for unpacking compressed releases.
   * @param projectConfig - The application configuration containing paths and settings.
   * @param hookExecutor - The hook executor for running lifecycle hooks.
   */
  constructor(
    private readonly fs: IFileSystem,
    private readonly downloader: IDownloader,
    private readonly githubApiClient: IGitHubApiClient,
    private readonly archiveExtractor: IArchiveExtractor,
    private readonly projectConfig: ProjectConfig,
    private readonly hookExecutor: HookExecutor
  ) {}

  async install(
    toolName: string,
    toolConfig: GithubReleaseToolConfig,
    context: BaseInstallContext,
    options: IInstallOptions | undefined,
    logger: TsLogger
  ): Promise<InstallResult<IGitHubReleaseInstallMetadata>> {
    // Create tool-specific file system
    const toolFs = createToolFileSystem(this.fs, toolName);

    // Delegate to existing implementation
    const result = await installFromGitHubRelease(
      toolName,
      toolConfig,
      context,
      options,
      toolFs,
      this.downloader,
      this.githubApiClient,
      this.archiveExtractor,
      this.projectConfig,
      this.hookExecutor,
      logger
    );

    return result;
  }

  supportsUpdateCheck(): boolean {
    return true;
  }

  async checkUpdate(
    toolName: string,
    toolConfig: GithubReleaseToolConfig,
    _context: BaseInstallContext,
    logger: TsLogger
  ): Promise<UpdateCheckResult> {
    try {
      const githubParams = toolConfig.installParams;
      const repo = githubParams.repo;
      const [owner, repoName] = repo.split('/');

      if (!owner || !repoName) {
        const result: UpdateCheckResult = {
          success: false,
          error: `Invalid repo format: ${repo}. Expected owner/repo`,
        };
        return result;
      }

      const latestRelease = await this.githubApiClient.getLatestRelease(owner, repoName);
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
    toolConfig: GithubReleaseToolConfig,
    context: BaseInstallContext,
    options: IUpdateOptions,
    logger: TsLogger
  ): Promise<UpdateResult> {
    try {
      const githubParams = toolConfig.installParams;
      const repo = githubParams.repo;
      const [owner, repoName] = repo.split('/');

      if (!owner || !repoName) {
        return {
          success: false,
          error: `Invalid repo format: ${repo}. Expected owner/repo`,
        };
      }

      const latestRelease = await this.githubApiClient.getLatestRelease(owner, repoName);
      if (!latestRelease || !latestRelease.tag_name) {
        return {
          success: false,
          error: `Could not fetch latest release for ${toolName}`,
        };
      }

      const oldVersion = toolConfig.installParams.version || toolConfig.version || 'latest';
      const newVersion = options.targetVersion || latestRelease.tag_name.replace(/^v/, '');

      const updatedConfig: GithubReleaseToolConfig = {
        ...toolConfig,
        version: newVersion,
        installParams: {
          ...toolConfig.installParams,
          version: newVersion,
        },
      };

      // Create versioned install directory: binariesDir/toolName/version
      const binariesDir = context.installDir;
      const versionedInstallDir = `${binariesDir}/${toolName}/${newVersion}`;
      await this.fs.ensureDir(versionedInstallDir);

      const updatedContext: BaseInstallContext = {
        ...context,
        installDir: versionedInstallDir,
      };

      const installResult = await this.install(
        toolName,
        updatedConfig,
        updatedContext,
        { force: options.force || true },
        logger
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

  getReadmeUrl(_toolName: string, toolConfig: GithubReleaseToolConfig): string | null {
    const githubParams = toolConfig.installParams;
    const repo = githubParams.repo;
    const [owner, repoName] = repo.split('/');

    if (!owner || !repoName) {
      return null;
    }

    const branch = toolConfig.version || 'main';
    return `https://raw.githubusercontent.com/${owner}/${repoName}/${branch}/README.md`;
  }
}
