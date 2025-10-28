import crypto from 'node:crypto';
import type { YamlConfig } from '@dotfiles/config';
import type { ICache } from '@dotfiles/downloader';
import {
  ClientError,
  ForbiddenError,
  HttpError,
  type IDownloader,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServerError,
} from '@dotfiles/downloader';
import type { TsLogger } from '@dotfiles/logger';
import type { GitHubRateLimit, GitHubRelease } from '@dotfiles/schemas';
import semver from 'semver';
import { GitHubApiClientError } from './GitHubApiClientError';
import type { IGitHubApiClient } from './IGitHubApiClient';
import { githubApiClientLogMessages } from './log-messages';

/**
 * Implements the IGitHubApiClient interface for interacting with the GitHub API.
 *
 * This client handles the construction of API requests, authentication,
 * and response parsing. It also integrates a caching layer to reduce
 * redundant API calls and avoid rate-limiting issues.
 *
 * ### API Caching
 * The client features a built-in, configurable caching mechanism that utilizes
 * an `IGitHubApiCache` implementation (e.g., `FileGitHubApiCache`). Caching behavior
 * is controlled by `appConfig.githubApiCacheEnabled` and `appConfig.githubApiCacheTtl`.
 * Cache keys are uniquely generated based on the API endpoint and the authentication
 * token to ensure data integrity.
 *
 * ### Error Handling
 * It translates HTTP errors from the downloader into specific, custom error classes
 * like `NotFoundError` and `RateLimitError`. This allows consumers of the client
 * to handle API errors in a predictable manner.
 *
 * ### Host Configuration
 * The GitHub API base URL is configurable via `appConfig.githubHost`, which is
 * essential for testing against a mock server.
 *
 * @testing
 * For testing this client, two primary helpers are available:
 * - `FetchMockHelper`: For mocking `fetch` requests and their responses.
 *   (from `src/testing-helpers/FetchMockHelper.ts`)
 * - `createMockApiServer`: For creating a lightweight mock API server
 *   using `express`, allowing for end-to-end testing of the client's
 *   interaction with a live server.
 *   (from `src/testing-helpers/createMockApiServer.ts`)
 */
export class GitHubApiClient implements IGitHubApiClient {
  private readonly baseUrl: string;
  private readonly githubToken?: string;
  private readonly downloader: IDownloader;
  private readonly userAgent: string;
  private readonly cache?: ICache;
  private readonly cacheEnabled: boolean;
  private readonly cacheTtlMs: number;
  private readonly logger: TsLogger;

  constructor(parentLogger: TsLogger, config: YamlConfig, downloader: IDownloader, cache?: ICache) {
    this.logger = parentLogger.getSubLogger({ name: 'GitHubApiClient' });
    this.baseUrl = config.github.host;
    this.githubToken = config.github.token;
    this.downloader = downloader;
    this.userAgent = config.github.userAgent;
    this.cache = cache;
    this.cacheEnabled = config.github.cache.enabled;
    this.cacheTtlMs = config.github.cache.ttl;
    const logger = this.logger.getSubLogger({ name: 'constructor' });
    logger.debug(githubApiClientLogMessages.constructor.initialized(this.baseUrl, this.userAgent));
    if (this.githubToken) {
      logger.debug(githubApiClientLogMessages.constructor.authTokenPresent());
    } else {
      logger.debug(githubApiClientLogMessages.constructor.authTokenMissing());
    }

    if (this.cache && this.cacheEnabled) {
      logger.debug(githubApiClientLogMessages.cache.enabled(this.cacheTtlMs));
    } else if (this.cache && !this.cacheEnabled) {
      logger.debug(githubApiClientLogMessages.cache.disabled());
    } else {
      logger.debug(githubApiClientLogMessages.cache.missing());
    }
  }

  /**
   * Generates a unique cache key for a GitHub API request.
   * @param endpoint The API endpoint path
   * @param method The HTTP method
   * @returns A unique cache key
   * @private
   */
  private generateCacheKey(endpoint: string, method: string): string {
    // Create a base key from the method and endpoint
    let key = `${method}:${endpoint}`;

    // If a token is used, include a hash of it in the key
    // This ensures cache invalidation when the token changes
    if (this.githubToken && typeof this.githubToken === 'string' && this.githubToken.length > 0) {
      const tokenHash = crypto.createHash('sha256').update(this.githubToken).digest('hex').substring(0, 8); // Use only first 8 chars of hash
      key += `:${tokenHash}`;
    }

    return key;
  }

  private async request<T>(endpoint: string, method: 'GET' = 'GET'): Promise<T> {
    const logger = this.logger.getSubLogger({ name: 'request' });
    const url = `${this.baseUrl}${endpoint}`;
    const cacheKey = this.generateCacheKey(endpoint, method);

    const cachedResult = await this.tryGetFromCache<T>(cacheKey, method);
    if (cachedResult) {
      return cachedResult;
    }

    logger.debug(githubApiClientLogMessages.request.performing(method, url));
    const headers = this.buildRequestHeaders();

    try {
      const data = await this.performRequest<T>(url, headers);
      await this.tryCacheResponse(cacheKey, data, method);
      return data;
    } catch (error) {
      return this.handleRequestError(error, url);
    }
  }

  private async tryGetFromCache<T>(cacheKey: string, method: string): Promise<T | null> {
    if (!this.cache || !this.cacheEnabled || method !== 'GET') {
      return null;
    }

    try {
      const cachedData = await this.cache.get<T>(cacheKey);
      if (cachedData) {
        return cachedData;
      }
    } catch {
      // Cache layer logs retrieval failures
    }

    return null;
  }

  private buildRequestHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': this.userAgent,
    };

    if (this.githubToken) {
      headers['Authorization'] = `token ${this.githubToken}`;
    }

    return headers;
  }

  private async performRequest<T>(url: string, headers: Record<string, string>): Promise<T> {
    const logger = this.logger.getSubLogger({ name: 'performRequest' });
    const responseBuffer = await this.downloader.download(url, { headers });
    if (!responseBuffer || responseBuffer.length === 0) {
      logger.debug(githubApiClientLogMessages.request.emptyResponse(url));
      throw new NetworkError(this.logger, 'Empty response received from API', url);
    }
    const responseText = responseBuffer.toString('utf-8');
    return JSON.parse(responseText) as T;
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

  private handleRequestError(error: unknown, url: string): never {
    const logger = this.logger.getSubLogger({ name: 'handleRequestError' });
    logger.debug(githubApiClientLogMessages.errors.requestFailure(url), error);

    if (error instanceof NotFoundError) {
      logger.debug(githubApiClientLogMessages.errors.notFound(url), error.responseBody);
      throw new Error(`GitHub resource not found: ${url}. Status: ${error.statusCode}`);
    }
    if (error instanceof RateLimitError) {
      return this.handleRateLimitError(error, url);
    }
    if (error instanceof ForbiddenError) {
      return this.handleForbiddenError(error, url);
    }
    if (error instanceof ClientError) {
      return this.handleClientError(error, url);
    }
    if (error instanceof ServerError) {
      return this.handleServerError(error, url);
    }
    if (error instanceof HttpError) {
      return this.handleHttpError(error, url);
    }
    if (error instanceof NetworkError) {
      return this.handleNetworkError(error, url);
    }

    return this.handleUnknownError(error, url);
  }

  private handleRateLimitError(error: RateLimitError, url: string): never {
    const logger = this.logger.getSubLogger({ name: 'handleRateLimitError' });
    const resetTime = error.resetTimestamp ? new Date(error.resetTimestamp).toISOString() : 'N/A';
    logger.debug(githubApiClientLogMessages.errors.rateLimit(url, resetTime), error.responseBody);
    throw new GitHubApiClientError(
      `GitHub API rate limit exceeded for ${url}. Status: ${error.statusCode}. Resets at ${resetTime}.`,
      error.statusCode,
      error
    );
  }

  private handleForbiddenError(error: ForbiddenError, url: string): never {
    const logger = this.logger.getSubLogger({ name: 'handleForbiddenError' });
    logger.debug(githubApiClientLogMessages.errors.forbidden(url), error.responseBody);
    throw new GitHubApiClientError(
      `GitHub API request forbidden for ${url}. Status: ${error.statusCode}.`,
      error.statusCode,
      error
    );
  }

  private handleClientError(error: ClientError, url: string): never {
    const logger = this.logger.getSubLogger({ name: 'handleClientError' });
    logger.debug(githubApiClientLogMessages.errors.client(url, error.statusCode), error.responseBody);
    throw new GitHubApiClientError(
      `GitHub API client error for ${url}. Status: ${error.statusCode} ${error.statusText}.`,
      error.statusCode,
      error
    );
  }

  private handleServerError(error: ServerError, url: string): never {
    const logger = this.logger.getSubLogger({ name: 'handleServerError' });
    logger.debug(githubApiClientLogMessages.errors.server(url, error.statusCode), error.responseBody);
    throw new GitHubApiClientError(
      `GitHub API server error for ${url}. Status: ${error.statusCode} ${error.statusText}.`,
      error.statusCode,
      error
    );
  }

  private handleHttpError(error: HttpError, url: string): never {
    const logger = this.logger.getSubLogger({ name: 'handleHttpError' });
    logger.debug(githubApiClientLogMessages.errors.http(url, error.statusCode), error);
    throw new GitHubApiClientError(
      `GitHub API HTTP error for ${url}. Status: ${error.statusCode} ${error.statusText}.`,
      error.statusCode,
      error
    );
  }

  private handleNetworkError(error: NetworkError, url: string): never {
    const logger = this.logger.getSubLogger({ name: 'handleNetworkError' });
    logger.debug(githubApiClientLogMessages.errors.network(url), error);
    throw new GitHubApiClientError(`Network error while requesting ${url}: ${error.message}`, undefined, error);
  }

  private handleUnknownError(error: unknown, url: string): never {
    const logger = this.logger.getSubLogger({ name: 'handleUnknownError' });
    logger.debug(githubApiClientLogMessages.errors.unknown(url), error);
    if (error instanceof Error) {
      throw new GitHubApiClientError(
        `Unknown error during GitHub API request to ${url}: ${error.message}`,
        undefined,
        error
      );
    }
    throw new GitHubApiClientError(`Unknown error during GitHub API request to ${url}`);
  }

  async getLatestRelease(owner: string, repo: string): Promise<GitHubRelease | null> {
    const logger = this.logger.getSubLogger({ name: 'getLatestRelease' });
    logger.debug(githubApiClientLogMessages.releases.fetchingLatest(owner, repo));
    try {
      return await this.request<GitHubRelease>(`/repos/${owner}/${repo}/releases/latest`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('GitHub resource not found')) {
        logger.debug(githubApiClientLogMessages.releases.latestNotFound(owner, repo));
        return null;
      }
      logger.debug(githubApiClientLogMessages.releases.latestError(owner, repo), error);
      throw error;
    }
  }

  async getReleaseByTag(owner: string, repo: string, tag: string): Promise<GitHubRelease | null> {
    const logger = this.logger.getSubLogger({ name: 'getReleaseByTag' });
    logger.debug(githubApiClientLogMessages.releases.fetchingByTag(tag, owner, repo));
    try {
      return await this.request<GitHubRelease>(`/repos/${owner}/${repo}/releases/tags/${tag}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('GitHub resource not found')) {
        logger.debug(githubApiClientLogMessages.releases.tagNotFound(tag, owner, repo));
        return null;
      }
      logger.debug(githubApiClientLogMessages.releases.tagError(tag, owner, repo), error);
      throw error;
    }
  }

  async getAllReleases(
    owner: string,
    repo: string,
    options?: { perPage?: number; includePrerelease?: boolean }
  ): Promise<GitHubRelease[]> {
    const logger = this.logger.getSubLogger({ name: 'getAllReleases' });
    logger.debug(githubApiClientLogMessages.releases.fetchingAll(owner, repo), options);
    const perPage = options?.perPage || 30; // Default to 30, max 100
    let page = 1;
    let allReleases: GitHubRelease[] = [];
    let keepFetching = true;

    while (keepFetching) {
      const endpoint = `/repos/${owner}/${repo}/releases?per_page=${perPage}&page=${page}`;
      logger.debug(githubApiClientLogMessages.releases.fetchingPage(page, endpoint));
      const releasesPage = await this.request<GitHubRelease[]>(endpoint);

      if (releasesPage.length === 0) {
        keepFetching = false;
      } else {
        allReleases = allReleases.concat(releasesPage);
        page++;
        if (releasesPage.length < perPage) {
          keepFetching = false; // Last page
        }
      }
    }
    logger.debug(githubApiClientLogMessages.releases.totalFetched(allReleases.length, owner, repo));

    if (options?.includePrerelease === false) {
      // GitHub API doesn't directly filter out prereleases in the /releases endpoint AFAIK
      // We need to filter them client-side if includePrerelease is explicitly false.
      // If includePrerelease is true or undefined, we return all (including prereleases).
      const filteredReleases = allReleases.filter((release) => !release.prerelease);
      logger.debug(githubApiClientLogMessages.releases.filteredPrereleases(filteredReleases.length));
      return filteredReleases;
    }

    return allReleases;
  }

  async getReleaseByConstraint(owner: string, repo: string, constraint: string): Promise<GitHubRelease | null> {
    const logger = this.logger.getSubLogger({ name: 'getReleaseByConstraint' });
    logger.debug(githubApiClientLogMessages.constraints.searching(constraint, owner, repo));

    if (constraint === 'latest') {
      return await this.handleLatestConstraint(owner, repo);
    }

    return await this.findReleaseByVersionConstraint(owner, repo, constraint);
  }

  private async handleLatestConstraint(owner: string, repo: string): Promise<GitHubRelease | null> {
    try {
      return await this.getLatestRelease(owner, repo);
    } catch (error) {
      const logger = this.logger.getSubLogger({ name: 'handleLatestConstraint' });
      logger.debug(githubApiClientLogMessages.errors.constraintLatestError(), error);
      return null;
    }
  }

  private async findReleaseByVersionConstraint(
    owner: string,
    repo: string,
    constraint: string
  ): Promise<GitHubRelease | null> {
    const logger = this.logger.getSubLogger({ name: 'findReleaseByVersionConstraint' });
    logger.debug(githubApiClientLogMessages.constraints.pageFetch(constraint));

    let latestSatisfyingRelease: GitHubRelease | null = null;
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
        latestSatisfyingVersionClean
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
    constraint: string
  ): Promise<GitHubRelease[] | null> {
    const endpoint = `/repos/${owner}/${repo}/releases?per_page=${perPage}&page=${page}`;
    const logger = this.logger.getSubLogger({ name: 'fetchReleasesPage' });
    logger.debug(githubApiClientLogMessages.constraints.pageRequest(page, owner, repo));

    try {
      return await this.request<GitHubRelease[]>(endpoint);
    } catch (error) {
      logger.debug(githubApiClientLogMessages.errors.constraintError(constraint, owner, repo), error);
      return null;
    }
  }

  private findBestReleaseFromPage(
    releasesPage: GitHubRelease[],
    constraint: string,
    currentBest: GitHubRelease | null,
    currentBestVersion: string | null
  ): { release: GitHubRelease | null; version: string | null } {
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
          logger.debug(githubApiClientLogMessages.constraints.bestCandidate(release.tag_name, cleanVersion));
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

  private logConstraintResult(constraint: string, result: GitHubRelease | null): void {
    const logger = this.logger.getSubLogger({ name: 'logConstraintResult' });
    if (result) {
      logger.debug(githubApiClientLogMessages.constraints.resultFound(constraint, result.tag_name));
    } else {
      logger.debug(githubApiClientLogMessages.constraints.resultMissing(constraint));
    }
  }

  async getRateLimit(): Promise<GitHubRateLimit> {
    const logger = this.logger.getSubLogger({ name: 'getRateLimit' });
    logger.debug(githubApiClientLogMessages.rateLimit.fetching());
    // The actual rate limit data is nested under "resources"
    type RateLimitResponse = {
      resources: {
        core: GitHubRateLimit;
        search: GitHubRateLimit;
        graphql: GitHubRateLimit;
        integration_manifest: GitHubRateLimit;
        source_import: GitHubRateLimit;
        code_scanning_upload: GitHubRateLimit;
        actions_runner_registration: GitHubRateLimit;
        scim: GitHubRateLimit;
      };
      rate: GitHubRateLimit; // This is the primary one usually referred to
    };
    const response = await this.request<RateLimitResponse>('/rate_limit');
    return response.resources.core; // Or response.rate, depending on which one is more relevant
  }
}
