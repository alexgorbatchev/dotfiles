import crypto from 'node:crypto';
import type { ICache } from '@modules/cache';
import type { YamlConfig } from '@modules/config';
import {
  ClientError,
  ForbiddenError,
  HttpError,
  type IDownloader,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServerError,
} from '@modules/downloader';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import type { GitHubRateLimit, GitHubRelease } from '@types';
import semver from 'semver';
import { GitHubApiClientError } from './GitHubApiClientError';
import type { IGitHubApiClient } from './IGitHubApiClient';

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

    this.logger.debug(logs.githubClient.debug.constructorInit(), this.baseUrl, this.userAgent);
    if (this.githubToken) {
      this.logger.debug(logs.githubClient.debug.authToken());
    } else {
      this.logger.debug(logs.githubClient.debug.noAuthToken());
    }

    if (this.cache && this.cacheEnabled) {
      this.logger.debug(logs.githubClient.debug.cacheEnabled(), this.cacheTtlMs);
    } else if (this.cache && !this.cacheEnabled) {
      this.logger.debug(logs.githubClient.debug.cacheDisabled());
    } else {
      this.logger.debug(logs.githubClient.debug.noCache());
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
    const url = `${this.baseUrl}${endpoint}`;
    const cacheKey = this.generateCacheKey(endpoint, method);

  const cachedResult = await this.tryGetFromCache<T>(cacheKey, method);
    if (cachedResult) {
      return cachedResult;
    }

    this.logger.debug(logs.githubClient.debug.makingRequest(), method, url);
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
    const responseBuffer = await this.downloader.download(url, { headers });
    if (!responseBuffer || responseBuffer.length === 0) {
      this.logger.debug(logs.githubClient.debug.emptyResponse(), url);
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
    this.logger.debug(logs.githubClient.debug.requestError(), url, error);

    if (error instanceof NotFoundError) {
      this.logger.debug(logs.githubClient.debug.notFound(), url, error.responseBody);
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
    const resetTime = error.resetTimestamp ? new Date(error.resetTimestamp).toISOString() : 'N/A';
    this.logger.debug(logs.githubClient.debug.rateLimitError(), url, resetTime, error.responseBody);
    throw new GitHubApiClientError(
      `GitHub API rate limit exceeded for ${url}. Status: ${error.statusCode}. Resets at ${resetTime}.`,
      error.statusCode,
      error
    );
  }

  private handleForbiddenError(error: ForbiddenError, url: string): never {
    this.logger.debug(logs.githubClient.debug.forbidden(), url, error.responseBody);
    throw new GitHubApiClientError(
      `GitHub API request forbidden for ${url}. Status: ${error.statusCode}.`,
      error.statusCode,
      error
    );
  }

  private handleClientError(error: ClientError, url: string): never {
    this.logger.debug(logs.githubClient.debug.clientError(), url, error.statusCode, error.responseBody);
    throw new GitHubApiClientError(
      `GitHub API client error for ${url}. Status: ${error.statusCode} ${error.statusText}.`,
      error.statusCode,
      error
    );
  }

  private handleServerError(error: ServerError, url: string): never {
    this.logger.debug(logs.githubClient.debug.serverError(), url, error.statusCode, error.responseBody);
    throw new GitHubApiClientError(
      `GitHub API server error for ${url}. Status: ${error.statusCode} ${error.statusText}.`,
      error.statusCode,
      error
    );
  }

  private handleHttpError(error: HttpError, url: string): never {
    this.logger.debug(logs.githubClient.debug.requestError(), url, error);
    throw new GitHubApiClientError(
      `GitHub API HTTP error for ${url}. Status: ${error.statusCode} ${error.statusText}.`,
      error.statusCode,
      error
    );
  }

  private handleNetworkError(error: NetworkError, url: string): never {
    this.logger.debug(logs.githubClient.debug.networkError(), url, error.message);
    throw new GitHubApiClientError(`Network error while requesting ${url}: ${error.message}`, undefined, error);
  }

  private handleUnknownError(error: unknown, url: string): never {
    this.logger.debug(logs.githubClient.debug.unknownError(), url, error);
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
    this.logger.debug(logs.githubClient.debug.fetchingLatestRelease(), owner, repo);
    try {
      return await this.request<GitHubRelease>(`/repos/${owner}/${repo}/releases/latest`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('GitHub resource not found')) {
        this.logger.debug(logs.githubClient.debug.latestReleaseNotFound(), owner, repo);
        return null;
      }
      this.logger.debug(logs.githubClient.debug.latestReleaseError(), owner, repo, (error as Error).message);
      throw error;
    }
  }

  async getReleaseByTag(owner: string, repo: string, tag: string): Promise<GitHubRelease | null> {
    this.logger.debug(logs.githubClient.debug.fetchingReleaseByTag(), tag, owner, repo);
    try {
      return await this.request<GitHubRelease>(`/repos/${owner}/${repo}/releases/tags/${tag}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('GitHub resource not found')) {
        this.logger.debug(logs.githubClient.debug.releaseByTagNotFound(), tag, owner, repo);
        return null;
      }
      this.logger.debug(logs.githubClient.debug.releaseByTagError(), tag, owner, repo, (error as Error).message);
      throw error;
    }
  }

  async getAllReleases(
    owner: string,
    repo: string,
    options?: { perPage?: number; includePrerelease?: boolean }
  ): Promise<GitHubRelease[]> {
    this.logger.debug(logs.githubClient.debug.fetchingAllReleases(), owner, repo, options);
    const perPage = options?.perPage || 30; // Default to 30, max 100
    let page = 1;
    let allReleases: GitHubRelease[] = [];
    let keepFetching = true;

    while (keepFetching) {
      const endpoint = `/repos/${owner}/${repo}/releases?per_page=${perPage}&page=${page}`;
      this.logger.debug(logs.githubClient.debug.fetchingPage(), page, endpoint);
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
    this.logger.debug(logs.githubClient.debug.totalReleasesFetched(), allReleases.length, owner, repo);

    if (options?.includePrerelease === false) {
      // GitHub API doesn't directly filter out prereleases in the /releases endpoint AFAIK
      // We need to filter them client-side if includePrerelease is explicitly false.
      // If includePrerelease is true or undefined, we return all (including prereleases).
      const filteredReleases = allReleases.filter((release) => !release.prerelease);
      this.logger.debug(logs.githubClient.debug.filteredPrereleases(), filteredReleases.length);
      return filteredReleases;
    }

    return allReleases;
  }

  async getReleaseByConstraint(owner: string, repo: string, constraint: string): Promise<GitHubRelease | null> {
    this.logger.debug(logs.githubClient.debug.constraintSearch(), constraint, owner, repo);

    if (constraint === 'latest') {
      return await this.handleLatestConstraint(owner, repo);
    }

    return await this.findReleaseByVersionConstraint(owner, repo, constraint);
  }

  private async handleLatestConstraint(owner: string, repo: string): Promise<GitHubRelease | null> {
    try {
      return await this.getLatestRelease(owner, repo);
    } catch (error) {
      this.logger.debug(logs.githubClient.debug.constraintLatestError(), (error as Error).message);
      return null;
    }
  }

  private async findReleaseByVersionConstraint(
    owner: string,
    repo: string,
    constraint: string
  ): Promise<GitHubRelease | null> {
    this.logger.debug(logs.githubClient.debug.constraintPageFetch(), constraint);

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
    this.logger.debug(logs.githubClient.debug.constraintFetchingPage(), page, owner, repo);

    try {
      return await this.request<GitHubRelease[]>(endpoint);
    } catch (error) {
      this.logger.debug(logs.githubClient.debug.constraintError(), constraint, owner, repo, (error as Error).message);
      return null;
    }
  }

  private findBestReleaseFromPage(
    releasesPage: GitHubRelease[],
    constraint: string,
    currentBest: GitHubRelease | null,
    currentBestVersion: string | null
  ): { release: GitHubRelease | null; version: string | null } {
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
          this.logger.debug(logs.githubClient.debug.constraintBestCandidate(), release.tag_name, cleanVersion);
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
    if (result) {
      this.logger.debug(logs.githubClient.debug.constraintFinalResult(), constraint, result.tag_name);
    } else {
      this.logger.debug(logs.githubClient.debug.constraintNotFound(), constraint);
    }
  }

  async getRateLimit(): Promise<GitHubRateLimit> {
    this.logger.debug(logs.githubClient.debug.fetchingRateLimit());
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
