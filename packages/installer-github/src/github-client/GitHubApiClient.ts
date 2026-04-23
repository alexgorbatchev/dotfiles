import type { ProjectConfig } from "@dotfiles/config";
import type { IGitHubRateLimit, IGitHubRelease } from "@dotfiles/core";
import type { ICache } from "@dotfiles/downloader";
import {
  ClientError,
  ForbiddenError,
  HttpError,
  type IDownloader,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServerError,
} from "@dotfiles/downloader";
import type { TsLogger } from "@dotfiles/logger";
import crypto from "node:crypto";
import semver from "semver";
import { GitHubApiClientError } from "./GitHubApiClientError";
import type { IGitHubApiClient } from "./IGitHubApiClient";
import { messages } from "./log-messages";
import type { IGitHubRateLimitResponse, IGitHubReleaseQueryOptions, IReleaseSelectionResult } from "./types";

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
 * is controlled by `projectConfig.github.cache.enabled` and `projectConfig.github.cache.ttl`.
 * Cache keys are uniquely generated based on the API endpoint and the authentication
 * token to ensure data integrity.
 *
 * ### Error Handling
 * It translates HTTP errors from the downloader into specific, custom error classes
 * like `NotFoundError` and `RateLimitError`. This allows consumers of the client
 * to handle API errors in a predictable manner.
 *
 * ### Host Configuration
 * The GitHub API base URL is configurable via `projectConfig.github.host`, which is
 * essential for testing against a mock server.
 *
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

  constructor(parentLogger: TsLogger, projectConfig: ProjectConfig, downloader: IDownloader, cache?: ICache) {
    this.logger = parentLogger.getSubLogger({ name: "GitHubApiClient" });
    this.baseUrl = projectConfig.github.host;
    this.githubToken = projectConfig.github.token;
    this.downloader = downloader;
    this.userAgent = projectConfig.github.userAgent;
    this.cache = cache;
    this.cacheEnabled = projectConfig.github.cache.enabled;
    this.cacheTtlMs = projectConfig.github.cache.ttl;
    const logger = this.logger.getSubLogger({ name: "constructor" });
    logger.debug(messages.constructor.initialized(this.baseUrl, this.userAgent));
    if (this.githubToken) {
      logger.debug(messages.constructor.authTokenPresent());
    } else {
      logger.debug(messages.constructor.authTokenMissing());
    }

    if (this.cache && this.cacheEnabled) {
      logger.debug(messages.cache.enabled(this.cacheTtlMs));
    } else if (this.cache && !this.cacheEnabled) {
      logger.debug(messages.cache.disabled());
    } else {
      logger.debug(messages.cache.missing());
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
    if (this.githubToken && typeof this.githubToken === "string" && this.githubToken.length > 0) {
      const tokenHash = crypto.createHash("sha256").update(this.githubToken).digest("hex").substring(0, 8); // Use only first 8 chars of hash
      key += `:${tokenHash}`;
    }

    return key;
  }

  private async request<T>(endpoint: string, method: "GET" = "GET"): Promise<T> {
    const logger = this.logger.getSubLogger({ name: "request" });
    const url = `${this.baseUrl}${endpoint}`;
    const cacheKey = this.generateCacheKey(endpoint, method);

    const cachedResult = await this.tryGetFromCache<T>(cacheKey, method);
    if (cachedResult) {
      return cachedResult;
    }

    logger.debug(messages.request.performing(method, url));
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
    if (!this.cache || !this.cacheEnabled || method !== "GET") {
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
      Accept: "application/vnd.github.v3+json",
      "User-Agent": this.userAgent,
    };

    if (this.githubToken) {
      headers["Authorization"] = `token ${this.githubToken}`;
    }

    return headers;
  }

  private async performRequest<T>(url: string, headers: Record<string, string>): Promise<T> {
    const logger = this.logger.getSubLogger({ name: "performRequest" });
    const responseBuffer = await this.downloader.download(logger, url, {
      headers,
      skipCache: !this.cache || !this.cacheEnabled,
    });
    if (!responseBuffer || responseBuffer.length === 0) {
      logger.debug(messages.request.emptyResponse(url));
      throw new NetworkError(this.logger, "Empty response received from API", url);
    }
    const responseText = responseBuffer.toString("utf-8");
    return JSON.parse(responseText) as T;
  }

  private async tryCacheResponse<T>(cacheKey: string, data: T, method: string): Promise<void> {
    if (!this.cache || !this.cacheEnabled || method !== "GET") {
      return;
    }

    try {
      await this.cache.set<T>(cacheKey, data, this.cacheTtlMs);
    } catch {
      // Cache layer logs storage failures
    }
  }

  private handleRequestError(error: unknown, url: string): never {
    const logger = this.logger.getSubLogger({ name: "handleRequestError" });
    logger.debug(messages.errors.requestFailure(url), error);

    if (error instanceof NotFoundError) {
      logger.debug(messages.errors.notFound(url), error.responseBody);
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
    const logger = this.logger.getSubLogger({ name: "handleRateLimitError" });
    const resetTime = error.resetTimestamp ? new Date(error.resetTimestamp).toISOString() : "N/A";
    logger.debug(messages.errors.rateLimit(url, resetTime), error.responseBody);
    throw new GitHubApiClientError(
      `GitHub API rate limit exceeded for ${url}. Status: ${error.statusCode}. Resets at ${resetTime}.`,
      error.statusCode,
      error,
    );
  }

  private handleForbiddenError(error: ForbiddenError, url: string): never {
    const logger = this.logger.getSubLogger({ name: "handleForbiddenError" });
    logger.debug(messages.errors.forbidden(url), error.responseBody);
    throw new GitHubApiClientError(
      `GitHub API request forbidden for ${url}. Status: ${error.statusCode}.`,
      error.statusCode,
      error,
    );
  }

  private handleClientError(error: ClientError, url: string): never {
    const logger = this.logger.getSubLogger({ name: "handleClientError" });
    logger.debug(messages.errors.client(url, error.statusCode), error.responseBody);
    throw new GitHubApiClientError(
      `GitHub API client error for ${url}. Status: ${error.statusCode} ${error.statusText}.`,
      error.statusCode,
      error,
    );
  }

  private handleServerError(error: ServerError, url: string): never {
    const logger = this.logger.getSubLogger({ name: "handleServerError" });
    logger.debug(messages.errors.server(url, error.statusCode), error.responseBody);
    throw new GitHubApiClientError(
      `GitHub API server error for ${url}. Status: ${error.statusCode} ${error.statusText}.`,
      error.statusCode,
      error,
    );
  }

  private handleHttpError(error: HttpError, url: string): never {
    const logger = this.logger.getSubLogger({ name: "handleHttpError" });
    logger.debug(messages.errors.http(url, error.statusCode), error);
    throw new GitHubApiClientError(
      `GitHub API HTTP error for ${url}. Status: ${error.statusCode} ${error.statusText}.`,
      error.statusCode,
      error,
    );
  }

  private handleNetworkError(error: NetworkError, url: string): never {
    const logger = this.logger.getSubLogger({ name: "handleNetworkError" });
    logger.debug(messages.errors.network(url), error);
    throw new GitHubApiClientError(`Network error while requesting ${url}: ${error.message}`, undefined, error);
  }

  private handleUnknownError(error: unknown, url: string): never {
    const logger = this.logger.getSubLogger({ name: "handleUnknownError" });
    logger.debug(messages.errors.unknown(url), error);
    if (error instanceof Error) {
      throw new GitHubApiClientError(
        `Unknown error during GitHub API request to ${url}: ${error.message}`,
        undefined,
        error,
      );
    }
    throw new GitHubApiClientError(`Unknown error during GitHub API request to ${url}`);
  }

  async getLatestRelease(owner: string, repo: string): Promise<IGitHubRelease | null> {
    const logger = this.logger.getSubLogger({ name: "getLatestRelease" });
    logger.debug(messages.releases.fetchingLatest(owner, repo));
    try {
      return await this.request<IGitHubRelease>(`/repos/${owner}/${repo}/releases/latest`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("GitHub resource not found")) {
        logger.debug(messages.releases.latestNotFound(owner, repo));
        return null;
      }
      logger.debug(messages.releases.latestError(owner, repo), error);
      throw error;
    }
  }

  async getReleaseByTag(owner: string, repo: string, tag: string): Promise<IGitHubRelease | null> {
    const logger = this.logger.getSubLogger({ name: "getReleaseByTag" });
    logger.debug(messages.releases.fetchingByTag(tag, owner, repo));
    try {
      return await this.request<IGitHubRelease>(`/repos/${owner}/${repo}/releases/tags/${tag}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("GitHub resource not found")) {
        logger.debug(messages.releases.tagNotFound(tag, owner, repo));
        return null;
      }
      logger.debug(messages.releases.tagError(tag, owner, repo), error);
      throw error;
    }
  }

  async getAllReleases(owner: string, repo: string, options?: IGitHubReleaseQueryOptions): Promise<IGitHubRelease[]> {
    const logger = this.logger.getSubLogger({ name: "getAllReleases" });
    logger.debug(messages.releases.fetchingAll(owner, repo), options);
    const perPage = options?.perPage || 30; // Default to 30, max 100
    const limit = options?.limit;
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
          keepFetching = false; // Last page
        }
        // Stop if we've reached the limit
        if (limit !== undefined && allReleases.length >= limit) {
          allReleases = allReleases.slice(0, limit);
          keepFetching = false;
        }
      }
    }
    logger.debug(messages.releases.totalFetched(allReleases.length, owner, repo));

    if (options?.includePrerelease === false) {
      // GitHub API doesn't directly filter out prereleases in the /releases endpoint AFAIK
      // We need to filter them client-side if includePrerelease is explicitly false.
      // If includePrerelease is true or undefined, we return all (including prereleases).
      const filteredReleases = allReleases.filter((release) => !release.prerelease);
      logger.debug(messages.releases.filteredPrereleases(filteredReleases.length));
      return filteredReleases;
    }

    return allReleases;
  }

  async getReleaseByConstraint(owner: string, repo: string, constraint: string): Promise<IGitHubRelease | null> {
    const logger = this.logger.getSubLogger({ name: "getReleaseByConstraint" });
    logger.debug(messages.constraints.searching(constraint, owner, repo));

    if (constraint === "latest") {
      return await this.handleLatestConstraint(owner, repo);
    }

    return await this.findReleaseByVersionConstraint(owner, repo, constraint);
  }

  private async handleLatestConstraint(owner: string, repo: string): Promise<IGitHubRelease | null> {
    try {
      return await this.getLatestRelease(owner, repo);
    } catch (error) {
      const logger = this.logger.getSubLogger({ name: "handleLatestConstraint" });
      logger.debug(messages.errors.constraintLatestError(), error);
      return null;
    }
  }

  private async findReleaseByVersionConstraint(
    owner: string,
    repo: string,
    constraint: string,
  ): Promise<IGitHubRelease | null> {
    const logger = this.logger.getSubLogger({ name: "findReleaseByVersionConstraint" });
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
    const logger = this.logger.getSubLogger({ name: "fetchReleasesPage" });
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
  ): IReleaseSelectionResult {
    const logger = this.logger.getSubLogger({ name: "findBestReleaseFromPage" });
    let bestRelease = currentBest;
    let bestVersion = currentBestVersion;

    for (const release of releasesPage) {
      if (!release.tag_name) {
        continue;
      }

      const cleanVersion = release.tag_name.startsWith("v") ? release.tag_name.substring(1) : release.tag_name;

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
    const logger = this.logger.getSubLogger({ name: "logConstraintResult" });
    if (result) {
      logger.debug(messages.constraints.resultFound(constraint, result.tag_name));
    } else {
      logger.debug(messages.constraints.resultMissing(constraint));
    }
  }

  async getRateLimit(): Promise<IGitHubRateLimit> {
    const logger = this.logger.getSubLogger({ name: "getRateLimit" });
    logger.debug(messages.rateLimit.fetching());
    // The actual rate limit data is nested under "resources"
    const response = await this.request<IGitHubRateLimitResponse>("/rate_limit");
    return response.resources.core; // Or response.rate, depending on which one is more relevant
  }

  async getLatestReleaseTags(owner: string, repo: string, count: number = 5): Promise<string[]> {
    const logger = this.logger.getSubLogger({ name: "getLatestReleaseTags" });
    logger.debug(messages.releases.fetchingLatestTags(owner, repo, count));

    try {
      // Fetch just enough releases to get the requested count
      const releases = await this.request<IGitHubRelease[]>(`/repos/${owner}/${repo}/releases?per_page=${count}`);
      const tags: string[] = releases.map((release) => release.tag_name);
      logger.debug(messages.releases.fetchedTags(tags.length));
      return tags;
    } catch (error) {
      logger.debug(messages.releases.fetchTagsError(owner, repo), error);
      return [];
    }
  }

  async probeLatestTag(owner: string, repo: string): Promise<string | null> {
    const logger = this.logger.getSubLogger({ name: "probeLatestTag" });
    logger.debug(messages.tagPattern.probing(owner, repo));

    // Use github.com (not api.github.com) - this does NOT count against API rate limits
    const probeUrl = `https://github.com/${owner}/${repo}/releases/latest`;

    try {
      // HEAD request with redirect: 'manual' to capture the redirect location
      const response = await fetch(probeUrl, {
        method: "HEAD",
        redirect: "manual",
      });

      // GitHub returns 302 redirect to the actual release tag URL
      const location = response.headers.get("location");
      if (!location) {
        logger.debug(messages.tagPattern.noRedirect(owner, repo));
        return null;
      }

      // Extract tag from URL: https://github.com/{owner}/{repo}/releases/tag/{tag}
      const tagMatch = location.match(/\/releases\/tag\/(.+)$/);
      const extractedTag = tagMatch?.[1];
      if (!extractedTag) {
        logger.debug(messages.tagPattern.noRedirect(owner, repo));
        return null;
      }

      const tag = decodeURIComponent(extractedTag);
      logger.debug(messages.tagPattern.detected(tag));
      return tag;
    } catch (error) {
      logger.debug(messages.tagPattern.probeFailed(owner, repo), error);
      return null;
    }
  }
}
