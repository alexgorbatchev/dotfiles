import type { ProjectConfig } from "@dotfiles/config";
import type { IShell } from "@dotfiles/core";
import type { ICache, IDownloader } from "@dotfiles/downloader";
import type { TsLogger } from "@dotfiles/logger";
import { GhCliApiClient } from "./GhCliApiClient";
import { GitHubApiClient } from "./GitHubApiClient";
import type { IGitHubApiClient } from "./IGitHubApiClient";

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
  /** Shell for executing gh CLI commands */
  shell: IShell;
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
 *   shell: shell,
 * });
 *
 * // Create gh CLI-based client
 * const ghClient = createGitHubApiClient({
 *   parentLogger: logger,
 *   projectConfig: config,
 *   downloader: downloader,
 *   shell: shell,
 *   useGhCli: true,
 * });
 * ```
 */
export function createGitHubApiClient(options: ICreateGitHubApiClientOptions): IGitHubApiClient {
  const { parentLogger, projectConfig, downloader, cache, useGhCli, shell } = options;

  if (useGhCli) {
    return new GhCliApiClient(parentLogger, projectConfig, shell, cache);
  }

  return new GitHubApiClient(parentLogger, projectConfig, downloader, cache);
}
