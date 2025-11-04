import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { YamlConfig } from '@dotfiles/config';
import type { IDownloader } from '@dotfiles/downloader';
import type { IFileSystem } from '@dotfiles/file-system';
import type { HookExecutor, IGitHubApiClient } from '@dotfiles/installer';
import { createToolFileSystem } from '@dotfiles/installer';
import type { InstallerPlugin, InstallOptions, InstallResult } from '@dotfiles/installer-plugin-system';
import type { TsLogger } from '@dotfiles/logger';
import type { BaseInstallContext, GithubReleaseInstallParams, GithubReleaseToolConfig } from '@dotfiles/schemas';
import { z } from 'zod';
import { installFromGitHubRelease } from './installFromGitHubRelease';
import type { GitHubReleaseInstallMetadata } from './types';

/**
 * Plugin for installing tools from GitHub releases
 */
export class GitHubReleaseInstallerPlugin
  implements
    InstallerPlugin<'github-release', GithubReleaseInstallParams, GithubReleaseToolConfig, GitHubReleaseInstallMetadata>
{
  public readonly method = 'github-release' as const;
  public readonly displayName = 'GitHub Release';
  public readonly version = '1.0.0';

  // Zod schemas for validation
  public readonly paramsSchema = z.object({
    repo: z.string(),
    version: z.string().optional(),
    assetPattern: z.string().optional(),
    assetSelector: z.any().optional(),
    env: z.record(z.string(), z.string()).optional(),
    hooks: z.any().optional(),
    githubHost: z.string().optional(),
  }) as z.ZodType<GithubReleaseInstallParams>;

  public readonly toolConfigSchema = z.object({
    installationMethod: z.literal('github-release'),
    installParams: this.paramsSchema,
    binaries: z.array(z.string()),
    name: z.string(),
    version: z.string(),
  }) as z.ZodType<GithubReleaseToolConfig>;

  constructor(
    private readonly fs: IFileSystem,
    private readonly downloader: IDownloader,
    private readonly githubApiClient: IGitHubApiClient,
    private readonly archiveExtractor: IArchiveExtractor,
    private readonly appConfig: YamlConfig,
    private readonly hookExecutor: HookExecutor
  ) {}

  async install(
    toolName: string,
    toolConfig: GithubReleaseToolConfig,
    context: BaseInstallContext,
    options: InstallOptions | undefined,
    logger: TsLogger
  ): Promise<InstallResult<GitHubReleaseInstallMetadata>> {
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
      this.appConfig,
      this.hookExecutor,
      logger
    );

    return result;
  }
}
