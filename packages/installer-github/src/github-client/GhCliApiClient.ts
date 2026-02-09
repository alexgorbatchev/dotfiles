import type { ProjectConfig } from '@dotfiles/config';
import type { IGitHubRateLimit, IGitHubRelease } from '@dotfiles/core';
import type { ICache } from '@dotfiles/downloader';
import type { TsLogger } from '@dotfiles/logger';
import crypto from 'node:crypto';
import semver from 'semver';
import { GitHubApiClientError } from './GitHubApiClientError';
import type { IGitHubApiClient } from './IGitHubApiClient';
import type { IShellExecutor } from './IShellExecutor';
import { messages } from './log-messages';

/**
 * GitHub API client implementation using the `gh` CLI.
 *
 * This client uses the `gh api` command to make requests to the GitHub API,
 * leveraging the CLI's built-in authentication and other features. It implements
 * the same caching mechanism as GitHubApiClient for consistency.
 *
 * ### Benefits of using gh CLI:
 * - Uses existing `gh auth` credentials (no need for separate token config)
 * - Better handling of corporate proxies and network configurations
 * - Consistent with other `gh` usage patterns
 *
 * ### Caching
 * The client uses the same ICache interface as GitHubApiClient. While `gh api`
 * has its own `--cache` flag, we implement caching at our layer for consistency
 * with the fetch-based client and to use the same cache storage.
 */
export class GhCliApiClient implements IGitHubApiClient {
  private readonly hostname: string;
  private readonly shellExecutor: IShellExecutor;
  private readonly cache?: ICache;
  private readonly cacheEnabled: boolean;
  private readonly cacheTtlMs: number;
  private readonly logger: TsLogger;

  constructor(
    parentLogger: TsLogger,
    projectConfig: ProjectConfig,
    shellExecutor: IShellExecutor,
    cache?: ICache,
  ) {
    this.logger = parentLogger.getSubLogger({ name: 'GhCliApiClient' });
    // Extract hostname from project config (e.g., 'api.github.com' -> 'github.com')
    this.hostname = this.extractHostname(projectConfig.github.host);
    this.shellExecutor = shellExecutor;
    this.cache = cache;
    this.cacheEnabled = projectConfig.github.cache.enabled;
    this.cacheTtlMs = projectConfig.github.cache.ttl;

    const logger = this.logger.getSubLogger({ name: 'constructor' });
    logger.debug(messages.ghCli.initialized(this.hostname));

    if (this.cache && this.cacheEnabled) {
      logger.debug(messages.cache.enabled(this.cacheTtlMs));
    } else if (this.cache && !this.cacheEnabled) {
      logger.debug(messages.cache.disabled());
    } else {
      logger.debug(messages.cache.missing());
    }
  }

  /**
   * Extracts the hostname for gh CLI from the API URL.
   * @param apiHost The full API URL (e.g., 'https://api.github.com')
   * @returns The hostname for gh CLI (e.g., 'github.com')
   */
  private extractHostname(apiHost: string): string {
    try {
      const url = new URL(apiHost);
      // Convert api.github.com -> github.com for standard GitHub
      if (url.hostname === 'api.github.com') {
        return 'github.com';
      }
      // For GitHub Enterprise, remove 'api.' prefix if present
      return url.hostname.replace(/^api\./, '');
    } catch {
      return 'github.com';
    }
  }

  /**
   * Generates a unique cache key for a GitHub API request.
   * Uses the same format as GitHubApiClient for cache interoperability.
   */
  private generateCacheKey(endpoint: string, method: string): string {
    // Use same key format as GitHubApiClient
    let key = `${method}:${endpoint}`;

    // gh CLI uses its own auth, but we still include a marker for cache separation
    const cliMarker = crypto.createHash('sha256').update('gh-cli').digest('hex').substring(0, 8);
    key += `:${cliMarker}`;

    return key;
  }

  /**
   * Makes a request using gh CLI.
   */
  private async request<T>(endpoint: string, method: 'GET' = 'GET'): Promise<T> {
    const logger = this.logger.getSubLogger({ name: 'request' });
    const cacheKey = this.generateCacheKey(endpoint, method);

    // Check cache first
    const cachedResult = await this.tryGetFromCache<T>(cacheKey, method, endpoint);
    if (cachedResult) {
      return cachedResult;
    }

    logger.debug(messages.ghCli.executing(endpoint));

    // Build gh api command arguments
    const args = this.buildGhApiArgs(endpoint, method);

    try {
      const data = await this.executeGhCommand<T>(endpoint, args);
      await this.tryCacheResponse(cacheKey, data, method);
      return data;
    } catch (error) {
      return this.handleRequestError(error, endpoint);
    }
  }

  /**
   * Builds arguments for the gh api command.
   */
  private buildGhApiArgs(endpoint: string, method: string): string[] {
    const args: string[] = ['api'];

    // Add hostname if not default github.com
    if (this.hostname !== 'github.com') {
      args.push('--hostname', this.hostname);
    }

    // Add method if not GET
    if (method !== 'GET') {
      args.push('--method', method);
    }

    // Add the endpoint (without leading slash for gh api)
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
    args.push(cleanEndpoint);

    return args;
  }

  /**
   * Executes the gh command and parses the response.
   */
  private async executeGhCommand<T>(endpoint: string, args: string[]): Promise<T> {
    const logger = this.logger.getSubLogger({ name: 'executeGhCommand' });
    const result = await this.shellExecutor.execute('gh', args);

    if (result.exitCode !== 0) {
      logger.debug(messages.ghCli.commandFailed(result.exitCode));
      throw this.parseGhError(result.stderr, result.exitCode, endpoint);
    }

    try {
      return JSON.parse(result.stdout) as T;
    } catch {
      logger.debug(messages.ghCli.parseError(endpoint));
      throw new GitHubApiClientError(`Failed to parse gh api response for ${endpoint}`, undefined);
    }
  }

  /**
   * Parses error output from gh CLI and returns appropriate error.
   */
  private parseGhError(stderr: string, exitCode: number, endpoint: string): GitHubApiClientError {
    const stderrLower = stderr.toLowerCase();

    // Handle common gh CLI errors
    if (stderrLower.includes('not found') || stderrLower.includes('404')) {
      return new GitHubApiClientError(`GitHub resource not found: ${endpoint}. Status: 404`, 404);
    }

    if (stderrLower.includes('rate limit') || stderrLower.includes('403')) {
      return new GitHubApiClientError(`GitHub API rate limit exceeded for ${endpoint}. Status: 403`, 403);
    }

    if (stderrLower.includes('unauthorized') || stderrLower.includes('401')) {
      return new GitHubApiClientError(`GitHub API unauthorized for ${endpoint}. Status: 401`, 401);
    }

    if (stderrLower.includes('forbidden')) {
      return new GitHubApiClientError(`GitHub API forbidden for ${endpoint}. Status: 403`, 403);
    }

    // Generic error
    return new GitHubApiClientError(
      `gh api command failed for ${endpoint} with exit code ${exitCode}: ${stderr}`,
      undefined,
    );
  }

  private async tryGetFromCache<T>(cacheKey: string, method: string, endpoint: string): Promise<T | null> {
    const logger = this.logger.getSubLogger({ name: 'tryGetFromCache' });

    if (!this.cache || !this.cacheEnabled || method !== 'GET') {
      return null;
    }

    try {
      const cachedData = await this.cache.get<T>(cacheKey);
      if (cachedData) {
        logger.debug(messages.ghCli.cacheHit(endpoint));
        return cachedData;
      }
      logger.debug(messages.ghCli.cacheMiss(endpoint));
    } catch {
      // Cache layer logs retrieval failures
    }

    return null;
  }

  private async tryCacheResponse<T>(cacheKey: string, data: T, method: string): Promise<void> {
    if (!this.cache || !this.cacheEnabled || method !== 'GET') {
      return;
    }

    try {
      await this.cache.set<T>(cacheKey, data, this.cacheTtlMs);
    } catch {
      // Cache layer logs storage failures
    }
  }

  private handleRequestError(error: unknown, endpoint: string): never {
    const logger = this.logger.getSubLogger({ name: 'handleRequestError' });
    logger.debug(messages.errors.requestFailure(endpoint), error);

    if (error instanceof GitHubApiClientError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new GitHubApiClientError(`Error during gh api request to ${endpoint}: ${error.message}`, undefined, error);
    }

    throw new GitHubApiClientError(`Unknown error during gh api request to ${endpoint}`);
  }

  async getLatestRelease(owner: string, repo: string): Promise<IGitHubRelease | null> {
    const logger = this.logger.getSubLogger({ name: 'getLatestRelease' });
    logger.debug(messages.releases.fetchingLatest(owner, repo));
    try {
      return await this.request<IGitHubRelease>(`/repos/${owner}/${repo}/releases/latest`);
    } catch (error) {
      if (error instanceof GitHubApiClientError && error.statusCode === 404) {
        logger.debug(messages.releases.latestNotFound(owner, repo));
        return null;
      }
      logger.debug(messages.releases.latestError(owner, repo), error);
      throw error;
    }
  }

  async getReleaseByTag(owner: string, repo: string, tag: string): Promise<IGitHubRelease | null> {
    const logger = this.logger.getSubLogger({ name: 'getReleaseByTag' });
    logger.debug(messages.releases.fetchingByTag(tag, owner, repo));
    try {
      return await this.request<IGitHubRelease>(`/repos/${owner}/${repo}/releases/tags/${tag}`);
    } catch (error) {
      if (error instanceof GitHubApiClientError && error.statusCode === 404) {
        logger.debug(messages.releases.tagNotFound(tag, owner, repo));
        return null;
      }
      logger.debug(messages.releases.tagError(tag, owner, repo), error);
      throw error;
    }
  }

  async getAllReleases(
    owner: string,
    repo: string,
    options?: { perPage?: number; includePrerelease?: boolean; },
  ): Promise<IGitHubRelease[]> {
    const logger = this.logger.getSubLogger({ name: 'getAllReleases' });
    logger.debug(messages.releases.fetchingAll(owner, repo), options);

    const perPage = options?.perPage || 30;
    let page = 1;
    let allReleases: IGitHubRelease[] = [];
    let keepFetching = true;

    while (keepFetching) {
      const endpoint = `/repos/${owner}/${repo}/releases?per_page=${perPage}&page=${page}`;
      logger.debug(messages.releases.fetchingPage(page, endpoint));
      const releasesPage = await this.request<IGitHubRelease[]>(endpoint);

      if (releasesPage.length === 0) {
        keepFetching = false;
      } else {
        allReleases = allReleases.concat(releasesPage);
        page++;
        if (releasesPage.length < perPage) {
          keepFetching = false;
        }
      }
    }

    logger.debug(messages.releases.totalFetched(allReleases.length, owner, repo));

    if (options?.includePrerelease === false) {
      const filteredReleases = allReleases.filter((release) => !release.prerelease);
      logger.debug(messages.releases.filteredPrereleases(filteredReleases.length));
      return filteredReleases;
    }

    return allReleases;
  }

  async getReleaseByConstraint(owner: string, repo: string, constraint: string): Promise<IGitHubRelease | null> {
    const logger = this.logger.getSubLogger({ name: 'getReleaseByConstraint' });
    logger.debug(messages.constraints.searching(constraint, owner, repo));

    if (constraint === 'latest') {
      return await this.handleLatestConstraint(owner, repo);
    }

    return await this.findReleaseByVersionConstraint(owner, repo, constraint);
  }

  private async handleLatestConstraint(owner: string, repo: string): Promise<IGitHubRelease | null> {
    try {
      return await this.getLatestRelease(owner, repo);
    } catch (error) {
      const logger = this.logger.getSubLogger({ name: 'handleLatestConstraint' });
      logger.debug(messages.errors.constraintLatestError(), error);
      return null;
    }
  }

  private async findReleaseByVersionConstraint(
    owner: string,
    repo: string,
    constraint: string,
  ): Promise<IGitHubRelease | null> {
    const logger = this.logger.getSubLogger({ name: 'findReleaseByVersionConstraint' });
    logger.debug(messages.constraints.pageFetch(constraint));

    let latestSatisfyingRelease: IGitHubRelease | null = null;
    let latestSatisfyingVersionClean: string | null = null;
    let page = 1;
    const perPage = 30;
    const maxPages = 100;

    while (page <= maxPages) {
      const releasesPage = await this.fetchReleasesPage(owner, repo, page, perPage, constraint);
      if (!releasesPage) {
        break;
      }

      if (releasesPage.length === 0) {
        break;
      }

      const bestFromPage = this.findBestReleaseFromPage(
        releasesPage,
        constraint,
        latestSatisfyingRelease,
        latestSatisfyingVersionClean,
      );

      if (bestFromPage.release) {
        latestSatisfyingRelease = bestFromPage.release;
        latestSatisfyingVersionClean = bestFromPage.version;
      }

      if (releasesPage.length < perPage) {
        break;
      }

      page++;
    }

    this.logConstraintResult(constraint, latestSatisfyingRelease);
    return latestSatisfyingRelease;
  }

  private async fetchReleasesPage(
    owner: string,
    repo: string,
    page: number,
    perPage: number,
    constraint: string,
  ): Promise<IGitHubRelease[] | null> {
    const endpoint = `/repos/${owner}/${repo}/releases?per_page=${perPage}&page=${page}`;
    const logger = this.logger.getSubLogger({ name: 'fetchReleasesPage' });
    logger.debug(messages.constraints.pageRequest(page, owner, repo));

    try {
      return await this.request<IGitHubRelease[]>(endpoint);
    } catch (error) {
      logger.debug(messages.errors.constraintError(constraint, owner, repo), error);
      return null;
    }
  }

  private findBestReleaseFromPage(
    releasesPage: IGitHubRelease[],
    constraint: string,
    currentBest: IGitHubRelease | null,
    currentBestVersion: string | null,
  ): { release: IGitHubRelease | null; version: string | null; } {
    const logger = this.logger.getSubLogger({ name: 'findBestReleaseFromPage' });
    let bestRelease = currentBest;
    let bestVersion = currentBestVersion;

    for (const release of releasesPage) {
      if (!release.tag_name) {
        continue;
      }

      const cleanVersion = release.tag_name.startsWith('v') ? release.tag_name.substring(1) : release.tag_name;

      if (this.isVersionSatisfying(cleanVersion, constraint)) {
        if (this.isBetterVersion(cleanVersion, bestVersion)) {
          bestRelease = release;
          bestVersion = cleanVersion;
          logger.debug(messages.constraints.bestCandidate(release.tag_name, cleanVersion));
        }
      }
    }

    return { release: bestRelease, version: bestVersion };
  }

  private isVersionSatisfying(version: string, constraint: string): boolean {
    return Boolean(semver.valid(version)) && semver.satisfies(version, constraint, { includePrerelease: true });
  }

  private isBetterVersion(newVersion: string, currentBestVersion: string | null): boolean {
    return !currentBestVersion || semver.gt(newVersion, currentBestVersion);
  }

  private logConstraintResult(constraint: string, result: IGitHubRelease | null): void {
    const logger = this.logger.getSubLogger({ name: 'logConstraintResult' });
    if (result) {
      logger.debug(messages.constraints.resultFound(constraint, result.tag_name));
    } else {
      logger.debug(messages.constraints.resultMissing(constraint));
    }
  }

  async getRateLimit(): Promise<IGitHubRateLimit> {
    const logger = this.logger.getSubLogger({ name: 'getRateLimit' });
    logger.debug(messages.rateLimit.fetching());

    type RateLimitResponse = {
      resources: {
        core: IGitHubRateLimit;
      };
      rate: IGitHubRateLimit;
    };

    const response = await this.request<RateLimitResponse>('/rate_limit');
    return response.resources.core;
  }

  async getLatestReleaseTags(owner: string, repo: string, count: number = 5): Promise<string[]> {
    const logger = this.logger.getSubLogger({ name: 'getLatestReleaseTags' });
    logger.debug(messages.releases.fetchingLatestTags(owner, repo, count));

    try {
      const releases = await this.request<IGitHubRelease[]>(`/repos/${owner}/${repo}/releases?per_page=${count}`);
      const tags = releases.map((release) => release.tag_name);
      logger.debug(messages.releases.fetchedTags(tags.length));
      return tags;
    } catch (error) {
      logger.debug(messages.releases.fetchTagsError(owner, repo), error);
      return [];
    }
  }

  async probeLatestTag(owner: string, repo: string): Promise<string | null> {
    const logger = this.logger.getSubLogger({ name: 'probeLatestTag' });
    logger.debug(messages.tagPattern.probing(owner, repo));

    // For gh CLI, we can just fetch the latest release directly
    // This is more reliable than the redirect-based probe
    try {
      const release = await this.getLatestRelease(owner, repo);
      if (release) {
        logger.debug(messages.tagPattern.detected(release.tag_name));
        return release.tag_name;
      }
      return null;
    } catch {
      logger.debug(messages.tagPattern.probeFailed(owner, repo));
      return null;
    }
  }
}
