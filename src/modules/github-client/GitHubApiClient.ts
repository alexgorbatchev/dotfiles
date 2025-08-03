import type { YamlConfig } from '@modules/config';
import {
  ClientError,
  ForbiddenError,
  HttpError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServerError,
  type IDownloader,
} from '@modules/downloader';
import type { TsLogger } from '@modules/logger';
import type { GitHubRateLimit, GitHubRelease } from '@types';
import crypto from 'crypto';
import semver from 'semver';
import { GitHubApiClientError } from './GitHubApiClientError';
import type { ICache } from '@modules/cache';
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
 * - `createMockGitHubServer`: For creating a lightweight mock GitHub API server
 *   using `express`, allowing for end-to-end testing of the client's
 *   interaction with a live server.
 *   (from `src/testing-helpers/createMockGitHubServer.ts`)
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

  constructor(
    parentLogger: TsLogger,
    config: YamlConfig,
    downloader: IDownloader,
    cache?: ICache,
  ) {
    this.logger = parentLogger.getSubLogger({ name: 'GitHubApiClient' });
    this.baseUrl = config.github.host;
    this.githubToken = config.github.token;
    this.downloader = downloader;
    this.userAgent = config.github.userAgent;
    this.cache = cache;
    this.cacheEnabled = config.github.cache.enabled;
    this.cacheTtlMs = config.github.cache.ttl;

    this.logger.debug(
      'constructor: GitHub API Client initialized. Base URL: %s, User-Agent: %s',
      this.baseUrl,
      this.userAgent,
    );
    if (this.githubToken) {
      this.logger.debug('constructor: Using GitHub token for authentication.');
    } else {
      this.logger.debug('constructor: No GitHub token provided; requests will be unauthenticated.');
    }

    if (this.cache && this.cacheEnabled) {
      this.logger.debug('constructor: Cache enabled with TTL of %d ms', this.cacheTtlMs);
    } else if (this.cache && !this.cacheEnabled) {
      this.logger.debug('constructor: Cache available but disabled by configuration');
    } else {
      this.logger.debug('constructor: No cache provided; API responses will not be cached');
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
      const tokenHash = crypto
        .createHash('sha256')
        .update(this.githubToken)
        .digest('hex')
        .substring(0, 8); // Use only first 8 chars of hash
      key += `:${tokenHash}`;
    }

    this.logger.debug('generateCacheKey: Generated key for %s %s', method, endpoint);
    return key;
  }

  private async request<T>(endpoint: string, method: 'GET' = 'GET'): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const cacheKey = this.generateCacheKey(endpoint, method);

    // Check cache first if enabled and it's a GET request
    if (this.cache && this.cacheEnabled && method === 'GET') {
      try {
        const cachedData = await this.cache.get<T>(cacheKey);
        if (cachedData) {
          this.logger.debug('request: Cache hit for %s request to %s', method, url);
          return cachedData;
        }
        this.logger.debug('request: Cache miss for %s request to %s', method, url);
      } catch (error) {
        // Log cache error but continue with the request
        this.logger.debug(
          'request: Error checking cache for %s request to %s: %s',
          method,
          url,
          (error as Error).message,
        );
      }
    }

    this.logger.debug('request: Making %s request to %s', method, url);

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': this.userAgent,
    };

    if (this.githubToken) {
      headers['Authorization'] = `token ${this.githubToken}`;
    }

    try {
      const responseBuffer = await this.downloader.download(url, { headers });
      if (!responseBuffer || responseBuffer.length === 0) {
        this.logger.debug('request: Empty response buffer from downloader for URL: %s', url);
        // This case might indicate a successful download of an empty file,
        // or an issue with the downloader not throwing an error for an empty response
        // when it should have. For API calls, an empty buffer is usually an error.
        throw new NetworkError(this.logger, 'Empty response received from API', url);
      }
      const responseText = responseBuffer.toString('utf-8');
      const data = JSON.parse(responseText) as T;

      // Cache the response if enabled and it's a GET request
      if (this.cache && this.cacheEnabled && method === 'GET') {
        try {
          await this.cache.set<T>(cacheKey, data, this.cacheTtlMs);
          this.logger.debug('request: Cached response for %s request to %s', method, url);
        } catch (error) {
          // Log cache error but don't fail the request
          this.logger.debug(
            'request: Error caching response for %s request to %s: %s',
            method,
            url,
            (error as Error).message,
          );
        }
      }

      return data;
    } catch (error) {
      this.logger.debug(
        'request: Error during request to %s. Error type: %s, Message: %s',
        url,
        error?.constructor?.name,
        (error as Error)?.message,
      );

      if (error instanceof NotFoundError) {
        this.logger.debug('request: GitHub resource not found (404): %s. Body: %s', url, error.responseBody);
        throw new Error(`GitHub resource not found: ${url}. Status: ${error.statusCode}`);
      }
      if (error instanceof RateLimitError) {
        const resetTime = error.resetTimestamp
          ? new Date(error.resetTimestamp).toISOString()
          : 'N/A';
        this.logger.debug(
          'request: GitHub API rate limit exceeded. URL: %s, Status: %d, Reset: %s. Body: %s',
          url,
          error.statusCode,
          resetTime,
          error.responseBody,
        );
        throw new GitHubApiClientError(
          `GitHub API rate limit exceeded for ${url}. Status: ${error.statusCode}. Resets at ${resetTime}.`,
          error.statusCode,
          error,
        );
      }
      if (error instanceof ForbiddenError) {
        this.logger.debug('request: GitHub API access forbidden (403): %s. Body: %s', url, error.responseBody);
        throw new GitHubApiClientError(
          `GitHub API request forbidden for ${url}. Status: ${error.statusCode}.`,
          error.statusCode,
          error,
        );
      }
      if (error instanceof ClientError) {
        this.logger.debug(
          'request: GitHub API client error (%d): %s. Body: %s',
          error.statusCode,
          url,
          error.responseBody,
        );
        throw new GitHubApiClientError(
          `GitHub API client error for ${url}. Status: ${error.statusCode} ${error.statusText}.`,
          error.statusCode,
          error,
        );
      }
      if (error instanceof ServerError) {
        this.logger.debug(
          'request: GitHub API server error (%d): %s. Body: %s',
          error.statusCode,
          url,
          error.responseBody,
        );
        throw new GitHubApiClientError(
          `GitHub API server error for ${url}. Status: ${error.statusCode} ${error.statusText}.`,
          error.statusCode,
          error,
        );
      }
      if (error instanceof HttpError) {
        this.logger.debug(
          'request: Generic HTTP error (%d) for %s. Body: %s',
          error.statusCode,
          url,
          error.responseBody,
        );
        throw new GitHubApiClientError(
          `GitHub API HTTP error for ${url}. Status: ${error.statusCode} ${error.statusText}.`,
          error.statusCode,
          error,
        );
      }
      if (error instanceof NetworkError) {
        this.logger.debug('request: Network error for %s: %s', url, error.message);
        throw new GitHubApiClientError(
          `Network error while requesting ${url}: ${error.message}`,
          undefined,
          error,
        );
      }
      // Fallback for unknown errors
      this.logger.debug('request: Unknown error for %s: %o', url, error);
      if (error instanceof Error) {
        throw new GitHubApiClientError(
          `Unknown error during GitHub API request to ${url}: ${error.message}`,
          undefined,
          error,
        );
      }
      throw new GitHubApiClientError(`Unknown error during GitHub API request to ${url}`);
    }
  }

  async getLatestRelease(owner: string, repo: string): Promise<GitHubRelease | null> {
    this.logger.debug('getLatestRelease: Fetching latest release for %s/%s', owner, repo);
    try {
      return await this.request<GitHubRelease>(`/repos/${owner}/${repo}/releases/latest`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('GitHub resource not found')) {
        this.logger.debug('getLatestRelease: Resource not found for %s/%s. Returning null.', owner, repo);
        return null;
      }
      this.logger.debug(
        'getLatestRelease: Error fetching latest release for %s/%s: %s. Re-throwing.',
        owner,
        repo,
        (error as Error).message,
      );
      throw error;
    }
  }

  async getReleaseByTag(owner: string, repo: string, tag: string): Promise<GitHubRelease | null> {
    this.logger.debug('getReleaseByTag: Fetching release by tag %s for %s/%s', tag, owner, repo);
    try {
      return await this.request<GitHubRelease>(`/repos/${owner}/${repo}/releases/tags/${tag}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('GitHub resource not found')) {
        this.logger.debug(
          'getReleaseByTag: Resource not found for %s/%s, tag %s. Returning null.',
          owner,
          repo,
          tag,
        );
        return null;
      }
      this.logger.debug(
        'getReleaseByTag: Error fetching release by tag %s for %s/%s: %s. Re-throwing.',
        tag,
        owner,
        repo,
        (error as Error).message,
      );
      throw error;
    }
  }

  async getAllReleases(
    owner: string,
    repo: string,
    options?: { perPage?: number; includePrerelease?: boolean },
  ): Promise<GitHubRelease[]> {
    this.logger.debug('getAllReleases: Fetching all releases for %s/%s with options: %o', owner, repo, options);
    const perPage = options?.perPage || 30; // Default to 30, max 100
    let page = 1;
    let allReleases: GitHubRelease[] = [];
    let keepFetching = true;

    while (keepFetching) {
      const endpoint = `/repos/${owner}/${repo}/releases?per_page=${perPage}&page=${page}`;
      this.logger.debug('getAllReleases: Fetching page %d from %s', page, endpoint);
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
    this.logger.debug('getAllReleases: Fetched %d releases in total for %s/%s', allReleases.length, owner, repo);

    if (options?.includePrerelease === false) {
      // GitHub API doesn't directly filter out prereleases in the /releases endpoint AFAIK
      // We need to filter them client-side if includePrerelease is explicitly false.
      // If includePrerelease is true or undefined, we return all (including prereleases).
      const filteredReleases = allReleases.filter((release) => !release.prerelease);
      this.logger.debug(
        'getAllReleases: Filtered out prereleases, %d releases remaining.',
        filteredReleases.length,
      );
      return filteredReleases;
    }

    return allReleases;
  }

  async getReleaseByConstraint(
    owner: string,
    repo: string,
    constraint: string,
  ): Promise<GitHubRelease | null> {
    this.logger.debug(
      'getReleaseByConstraint: Fetching release for %s/%s satisfying constraint "%s"',
      owner,
      repo,
      constraint
    );
    // For simplicity in this initial implementation, if constraint is 'latest', use getLatestRelease.
    if (constraint === 'latest') {
      try {
        return await this.getLatestRelease(owner, repo);
      } catch (e) {
        const error = e as Error;
        this.logger.debug(
          'getReleaseByConstraint: Error fetching latest release for constraint "latest": %s',
          error.message,
        );
        return null;
      }
    }

    this.logger.debug('getReleaseByConstraint: Iterating pages to find match for constraint "%s"', constraint);
    let latestSatisfyingRelease: GitHubRelease | null = null;
    let latestSatisfyingVersionClean: string | null = null;
    let page = 1;
    const perPage = 30; // Standard page size, could be configurable if needed
    let keepFetching = true;

    while (keepFetching) {
      const endpoint = `/repos/${owner}/${repo}/releases?per_page=${perPage}&page=${page}`;
      this.logger.debug('getReleaseByConstraint: Fetching page %d for %s/%s', page, owner, repo);
      let releasesPage: GitHubRelease[];
      try {
        releasesPage = await this.request<GitHubRelease[]>(endpoint);
      } catch (error) {
        this.logger.debug(
          'getReleaseByConstraint: Error fetching page %d for %s/%s: %s',
          page,
          owner,
          repo,
          (error as Error).message,
        );
        // If a page fetch fails, we can't reliably determine the latest, so return what we have or null.
        // For simplicity, we'll break and return the best found so far. A more robust solution might retry.
        break;
      }

      if (releasesPage.length === 0) {
        keepFetching = false; // No more releases to fetch
        break;
      }

      for (const release of releasesPage) {
        if (!release.tag_name) {
          continue;
        }
        const cleanVersion = release.tag_name.startsWith('v')
          ? release.tag_name.substring(1)
          : release.tag_name;

        if (
          semver.valid(cleanVersion) &&
          semver.satisfies(cleanVersion, constraint, { includePrerelease: true })
        ) {
          if (
            !latestSatisfyingRelease ||
            (latestSatisfyingVersionClean && semver.gt(cleanVersion, latestSatisfyingVersionClean))
          ) {
            latestSatisfyingRelease = release;
            latestSatisfyingVersionClean = cleanVersion;
            this.logger.debug(
              'getReleaseByConstraint: New best candidate found: %s (version %s)',
              release.tag_name,
              cleanVersion,
            );
          }
        }
      }

      // Optimization: If the current page is not full, it's the last page with data.
      if (releasesPage.length < perPage) {
        keepFetching = false;
      }
      // More aggressive optimization could be added here if needed, e.g., if oldest on page is too old.
      // For now, this ensures we check all potentially relevant pages.

      page++;
      if (page > 100) {
        // Safety break for very deep pagination, GitHub usually limits to around this.
        this.logger.debug('getReleaseByConstraint: Reached page limit (100), stopping search.');
        keepFetching = false;
      }
    }

    if (latestSatisfyingRelease) {
      this.logger.debug(
        'getReleaseByConstraint: Final best release for constraint "%s" is %s',
        constraint,
        latestSatisfyingRelease.tag_name,
      );
    } else {
      this.logger.debug('getReleaseByConstraint: No release found for constraint "%s"', constraint);
    }
    return latestSatisfyingRelease;
  }

  async getRateLimit(): Promise<GitHubRateLimit> {
    this.logger.debug('getRateLimit: Fetching rate limit status.');
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
