/**
 * @file GitHubApiClient.ts
 * @description Implements the IGitHubApiClient interface for interacting with the GitHub API.
 *
 * ## Development Plan
 *
 * - [x] Implement `GitHubApiClient` class which implements `IGitHubApiClient`.
 *   - [x] Constructor:
 *     - [x] Accept `AppConfig` (for `githubToken`, `downloadTimeout`).
 *     - [x] Accept `IDownloader` instance for making HTTP requests.
 *     - [x] Initialize base URL from config (`githubHost` or default to `https://api.github.com`).
 *     - [x] Initialize `User-Agent` header.
 *   - [x] Implement `getLatestRelease(owner, repo)`:
 *     - [x] Construct URL: `/repos/{owner}/{repo}/releases/latest`.
 *     - [x] Make request using `downloader`.
 *     - [x] Validate response and parse JSON.
 *     - [x] Handle API errors (404 returns null, 403 rate limit, etc.).
 *   - [x] Implement `getReleaseByTag(owner, repo, tag)`:
 *     - [x] Construct URL: `/repos/{owner}/{repo}/releases/tags/{tag}`.
 *     - [x] Make request, validate, parse, handle errors (404 returns null).
 *   - [x] Implement `getAllReleases(owner, repo, options)`:
 *     - [x] Construct URL: `/repos/{owner}/{repo}/releases`.
 *     - [x] Handle `perPage` option.
 *     - [x] Implement pagination (fetch all pages if necessary).
 *     - [x] Filter by `includePrerelease` if applicable (client-side).
 *     - [x] Make requests, validate, parse, handle errors.
 *   - [x] Implement `getReleaseByConstraint(owner, repo, constraint)`:
 *     - [x] Call `getLatestRelease` for 'latest' constraint.
 *     - [x] Use `semver` to find the best match for other constraints after fetching all releases.
 *     - [x] Return the matching release or null.
 *   - [x] Implement `getRateLimit()`:
 *     - [x] Construct URL: `/rate_limit`.
 *     - [x] Make request, validate, parse, handle errors.
 *   - [x] Helper method for making authenticated requests with error handling and JSON parsing.
 * - [x] Write tests for `GitHubApiClient.ts` in `__tests__/GitHubApiClient.test.ts`.
 *   - [x] Mock `IDownloader` and `AppConfig`.
 *   - [x] Test `getLatestRelease` success and error cases.
 *   - [x] Test `getReleaseByTag` success and error cases.
 *   - [x] Test `getAllReleases` (no options, with perPage, with includePrerelease, pagination).
 *   - [x] Test `getReleaseByConstraint` ('latest' constraint and placeholder for others).
 *   - [x] Test `getRateLimit` success and error cases.
 *   - [x] Test GitHub API error responses (403, 404, etc.).
 *   - [x] Test rate limit information parsing.
 * - [x] Make `userAgent` configurable via `AppConfig`.
 * - [x] Cleaned up internal TODO comments related to downloader interaction.
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Ensure 100% test coverage.
 * - [x] Update to use configurable `githubHost` from AppConfig.
 * - [x] Add tests for custom GitHub host functionality.
 * - [ ] Update the memory bank.
 */

import type { IGitHubApiClient } from './IGitHubApiClient';
import type { AppConfig, GitHubRateLimit, GitHubRelease } from '@types';
// Attempting direct import to resolve module issue
import type { IDownloader } from '../downloader/IDownloader';
import {
  NotFoundError,
  ForbiddenError,
  RateLimitError,
  ClientError,
  ServerError,
  HttpError,
  NetworkError,
} from '../downloader/errors';
import { createLogger } from '@modules/logger';
import semver from 'semver';
import { GitHubApiClientError } from './GitHubApiClientError';
import type { IGitHubApiCache } from './IGitHubApiCache';
import crypto from 'crypto';

const log = createLogger('GitHubApiClient');

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
 */
export class GitHubApiClient implements IGitHubApiClient {
  private readonly baseUrl: string;
  private readonly githubToken?: string;
  private readonly downloader: IDownloader;
  private readonly userAgent: string;
  private readonly cache?: IGitHubApiCache;
  private readonly cacheEnabled: boolean;
  private readonly cacheTtlMs: number;

  constructor(config: AppConfig, downloader: IDownloader, cache?: IGitHubApiCache) {
    this.baseUrl = config.githubHost || 'https://api.github.com';
    this.githubToken = config.githubToken;
    this.downloader = downloader;
    this.userAgent = config.githubClientUserAgent || 'dotfiles-generator/1.0.0';
    this.cache = cache;
    this.cacheEnabled = config.githubApiCacheEnabled ?? true;
    this.cacheTtlMs = config.githubApiCacheTtl ?? 86400000; // Default: 24 hours

    log(
      'constructor: GitHub API Client initialized. Base URL: %s, User-Agent: %s',
      this.baseUrl,
      this.userAgent
    );
    if (this.githubToken) {
      log('constructor: Using GitHub token for authentication.');
    } else {
      log('constructor: No GitHub token provided; requests will be unauthenticated.');
    }

    if (this.cache && this.cacheEnabled) {
      log('constructor: Cache enabled with TTL of %d ms', this.cacheTtlMs);
    } else if (this.cache && !this.cacheEnabled) {
      log('constructor: Cache available but disabled by configuration');
    } else {
      log('constructor: No cache provided; API responses will not be cached');
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
    if (this.githubToken) {
      const tokenHash = crypto
        .createHash('sha256')
        .update(this.githubToken)
        .digest('hex')
        .substring(0, 8); // Use only first 8 chars of hash
      key += `:${tokenHash}`;
    }

    log('generateCacheKey: Generated key for %s %s', method, endpoint);
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
          log('request: Cache hit for %s request to %s', method, url);
          return cachedData;
        }
        log('request: Cache miss for %s request to %s', method, url);
      } catch (error) {
        // Log cache error but continue with the request
        log(
          'request: Error checking cache for %s request to %s: %s',
          method,
          url,
          (error as Error).message
        );
      }
    }

    log('request: Making %s request to %s', method, url);

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
        log('request: Empty response buffer from downloader for URL: %s', url);
        // This case might indicate a successful download of an empty file,
        // or an issue with the downloader not throwing an error for an empty response
        // when it should have. For API calls, an empty buffer is usually an error.
        throw new NetworkError('Empty response received from API', url);
      }
      const responseText = responseBuffer.toString('utf-8');
      const data = JSON.parse(responseText) as T;

      // Cache the response if enabled and it's a GET request
      if (this.cache && this.cacheEnabled && method === 'GET') {
        try {
          await this.cache.set<T>(cacheKey, data, this.cacheTtlMs);
          log('request: Cached response for %s request to %s', method, url);
        } catch (error) {
          // Log cache error but don't fail the request
          log(
            'request: Error caching response for %s request to %s: %s',
            method,
            url,
            (error as Error).message
          );
        }
      }

      return data;
    } catch (error) {
      log(
        'request: Error during request to %s. Error type: %s, Message: %s',
        url,
        error?.constructor?.name,
        (error as Error)?.message
      );

      if (error instanceof NotFoundError) {
        log('request: GitHub resource not found (404): %s. Body: %s', url, error.responseBody);
        throw new Error(`GitHub resource not found: ${url}. Status: ${error.statusCode}`);
      }
      if (error instanceof RateLimitError) {
        const resetTime = error.resetTimestamp
          ? new Date(error.resetTimestamp).toISOString()
          : 'N/A';
        log(
          'request: GitHub API rate limit exceeded. URL: %s, Status: %d, Reset: %s. Body: %s',
          url,
          error.statusCode,
          resetTime,
          error.responseBody
        );
        throw new GitHubApiClientError(
          `GitHub API rate limit exceeded for ${url}. Status: ${error.statusCode}. Resets at ${resetTime}.`,
          error.statusCode,
          error
        );
      }
      if (error instanceof ForbiddenError) {
        log('request: GitHub API access forbidden (403): %s. Body: %s', url, error.responseBody);
        throw new GitHubApiClientError(
          `GitHub API request forbidden for ${url}. Status: ${error.statusCode}.`,
          error.statusCode,
          error
        );
      }
      if (error instanceof ClientError) {
        log(
          'request: GitHub API client error (%d): %s. Body: %s',
          error.statusCode,
          url,
          error.responseBody
        );
        throw new GitHubApiClientError(
          `GitHub API client error for ${url}. Status: ${error.statusCode} ${error.statusText}.`,
          error.statusCode,
          error
        );
      }
      if (error instanceof ServerError) {
        log(
          'request: GitHub API server error (%d): %s. Body: %s',
          error.statusCode,
          url,
          error.responseBody
        );
        throw new GitHubApiClientError(
          `GitHub API server error for ${url}. Status: ${error.statusCode} ${error.statusText}.`,
          error.statusCode,
          error
        );
      }
      if (error instanceof HttpError) {
        log(
          'request: Generic HTTP error (%d) for %s. Body: %s',
          error.statusCode,
          url,
          error.responseBody
        );
        throw new GitHubApiClientError(
          `GitHub API HTTP error for ${url}. Status: ${error.statusCode} ${error.statusText}.`,
          error.statusCode,
          error
        );
      }
      if (error instanceof NetworkError) {
        log('request: Network error for %s: %s', url, error.message);
        throw new GitHubApiClientError(
          `Network error while requesting ${url}: ${error.message}`,
          undefined,
          error
        );
      }
      // Fallback for unknown errors
      log('request: Unknown error for %s: %o', url, error);
      if (error instanceof Error) {
        throw new GitHubApiClientError(
          `Unknown error during GitHub API request to ${url}: ${error.message}`,
          undefined,
          error
        );
      }
      throw new GitHubApiClientError(`Unknown error during GitHub API request to ${url}`);
    }
  }

  async getLatestRelease(owner: string, repo: string): Promise<GitHubRelease | null> {
    log('getLatestRelease: Fetching latest release for %s/%s', owner, repo);
    try {
      return await this.request<GitHubRelease>(`/repos/${owner}/${repo}/releases/latest`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('GitHub resource not found')) {
        log('getLatestRelease: Resource not found for %s/%s. Returning null.', owner, repo);
        return null;
      }
      log(
        'getLatestRelease: Error fetching latest release for %s/%s: %s. Re-throwing.',
        owner,
        repo,
        (error as Error).message
      );
      throw error;
    }
  }

  async getReleaseByTag(owner: string, repo: string, tag: string): Promise<GitHubRelease | null> {
    log('getReleaseByTag: Fetching release by tag %s for %s/%s', tag, owner, repo);
    try {
      return await this.request<GitHubRelease>(`/repos/${owner}/${repo}/releases/tags/${tag}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('GitHub resource not found')) {
        log(
          'getReleaseByTag: Resource not found for %s/%s, tag %s. Returning null.',
          owner,
          repo,
          tag
        );
        return null;
      }
      log(
        'getReleaseByTag: Error fetching release by tag %s for %s/%s: %s. Re-throwing.',
        tag,
        owner,
        repo,
        (error as Error).message
      );
      throw error;
    }
  }

  async getAllReleases(
    owner: string,
    repo: string,
    options?: { perPage?: number; includePrerelease?: boolean }
  ): Promise<GitHubRelease[]> {
    log('getAllReleases: Fetching all releases for %s/%s with options: %o', owner, repo, options);
    const perPage = options?.perPage || 30; // Default to 30, max 100
    let page = 1;
    let allReleases: GitHubRelease[] = [];
    let keepFetching = true;

    while (keepFetching) {
      const endpoint = `/repos/${owner}/${repo}/releases?per_page=${perPage}&page=${page}`;
      log('getAllReleases: Fetching page %d from %s', page, endpoint);
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
    log('getAllReleases: Fetched %d releases in total for %s/%s', allReleases.length, owner, repo);

    if (options?.includePrerelease === false) {
      // GitHub API doesn't directly filter out prereleases in the /releases endpoint AFAIK
      // We need to filter them client-side if includePrerelease is explicitly false.
      // If includePrerelease is true or undefined, we return all (including prereleases).
      const filteredReleases = allReleases.filter((release) => !release.prerelease);
      log(
        'getAllReleases: Filtered out prereleases, %d releases remaining.',
        filteredReleases.length
      );
      return filteredReleases;
    }

    return allReleases;
  }

  async getReleaseByConstraint(
    owner: string,
    repo: string,
    constraint: string
  ): Promise<GitHubRelease | null> {
    log(
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
        log(
          'getReleaseByConstraint: Error fetching latest release for constraint "latest": %s',
          error.message
        );
        return null;
      }
    }

    log('getReleaseByConstraint: Iterating pages to find match for constraint "%s"', constraint);
    let latestSatisfyingRelease: GitHubRelease | null = null;
    let latestSatisfyingVersionClean: string | null = null;
    let page = 1;
    const perPage = 30; // Standard page size, could be configurable if needed
    let keepFetching = true;

    while (keepFetching) {
      const endpoint = `/repos/${owner}/${repo}/releases?per_page=${perPage}&page=${page}`;
      log('getReleaseByConstraint: Fetching page %d for %s/%s', page, owner, repo);
      let releasesPage: GitHubRelease[];
      try {
        releasesPage = await this.request<GitHubRelease[]>(endpoint);
      } catch (error) {
        log(
          'getReleaseByConstraint: Error fetching page %d for %s/%s: %s',
          page,
          owner,
          repo,
          (error as Error).message
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
            log(
              'getReleaseByConstraint: New best candidate found: %s (version %s)',
              release.tag_name,
              cleanVersion
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
        log('getReleaseByConstraint: Reached page limit (100), stopping search.');
        keepFetching = false;
      }
    }

    if (latestSatisfyingRelease) {
      log(
        'getReleaseByConstraint: Final best release for constraint "%s" is %s',
        constraint,
        latestSatisfyingRelease.tag_name
      );
    } else {
      log('getReleaseByConstraint: No release found for constraint "%s"', constraint);
    }
    return latestSatisfyingRelease;
  }

  async getRateLimit(): Promise<GitHubRateLimit> {
    log('getRateLimit: Fetching rate limit status.');
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
