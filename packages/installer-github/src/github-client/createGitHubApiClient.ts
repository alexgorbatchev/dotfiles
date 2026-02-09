import type { ProjectConfig } from '@dotfiles/config';
import type { ICache, IDownloader } from '@dotfiles/downloader';
import type { TsLogger } from '@dotfiles/logger';
import { BunShellExecutor } from './BunShellExecutor';
import { GhCliApiClient } from './GhCliApiClient';
import { GitHubApiClient } from './GitHubApiClient';
import type { IGitHubApiClient } from './IGitHubApiClient';
import type { IShellExecutor } from './IShellExecutor';

/**
 * Options for creating a GitHub API client.
 */
export interface ICreateGitHubApiClientOptions {
  /** Parent logger for creating sub-loggers */
  parentLogger: TsLogger;
  /** Project configuration */
  projectConfig: ProjectConfig;
  /** Downloader for fetch-based client */
  downloader: IDownloader;
  /** Optional cache for API responses */
  cache?: ICache;
  /** Whether to use gh CLI instead of fetch */
  useGhCli?: boolean;
  /** Shell executor for gh CLI-based client (optional, uses BunShellExecutor if not provided) */
  shellExecutor?: IShellExecutor;
}

/**
 * Factory function to create the appropriate GitHub API client.
 *
 * @param options - Configuration options for the client
 * @returns An IGitHubApiClient implementation
 *
 * @example
 * ```typescript
 * // Create fetch-based client (default)
 * const client = createGitHubApiClient({
 *   parentLogger: logger,
 *   projectConfig: config,
 *   downloader: downloader,
 *   cache: cache,
 * });
 *
 * // Create gh CLI-based client
 * const ghClient = createGitHubApiClient({
 *   parentLogger: logger,
 *   projectConfig: config,
 *   downloader: downloader,
 *   cache: cache,
 *   useGhCli: true,
 * });
 * ```
 */
export function createGitHubApiClient(options: ICreateGitHubApiClientOptions): IGitHubApiClient {
  const { parentLogger, projectConfig, downloader, cache, useGhCli, shellExecutor } = options;

  if (useGhCli) {
    const executor = shellExecutor ?? new BunShellExecutor();
    return new GhCliApiClient(parentLogger, projectConfig, executor, cache);
  }

  return new GitHubApiClient(parentLogger, projectConfig, downloader, cache);
}
