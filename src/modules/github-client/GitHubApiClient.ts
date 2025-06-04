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
 *     - [x] Initialize base URL (`https://api.github.com`).
 *     - [x] Initialize `User-Agent` header.
 *   - [x] Implement `getLatestRelease(owner, repo)`:
 *     - [x] Construct URL: `/repos/{owner}/{repo}/releases/latest`.
 *     - [x] Make request using `downloader`.
 *     - [x] Validate response and parse JSON.
 *     - [x] Handle API errors (404, 403 rate limit, etc.).
 *   - [x] Implement `getReleaseByTag(owner, repo, tag)`:
 *     - [x] Construct URL: `/repos/{owner}/{repo}/releases/tags/{tag}`.
 *     - [x] Make request, validate, parse, handle errors.
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
 * - [ ] Update the memory bank.
 */

import type { IGitHubApiClient } from './IGitHubApiClient';
import type { AppConfig, GitHubRateLimit, GitHubRelease, GitHubReleaseAsset } from '../../types';
// Attempting direct import to resolve module issue
import type { IDownloader } from '../downloader/IDownloader';
import { createLogger } from '../logger';
import semver from 'semver';

const log = createLogger('GitHubApiClient');

export class GitHubApiClient implements IGitHubApiClient {
  private readonly baseUrl = 'https://api.github.com';
  private readonly githubToken?: string;
  private readonly downloader: IDownloader;
  private readonly userAgent: string;

  constructor(config: AppConfig, downloader: IDownloader) {
    this.githubToken = config.githubToken;
    this.downloader = downloader;
    this.userAgent = config.githubClientUserAgent || 'dotfiles-generator/1.0.0';
    log('constructor: GitHub API Client initialized. User-Agent: %s', this.userAgent);
    if (this.githubToken) {
      log('constructor: Using GitHub token for authentication.');
    } else {
      log('constructor: No GitHub token provided; requests will be unauthenticated.');
    }
  }

  private async request<T>(endpoint: string, method: 'GET' = 'GET'): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
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
        throw new Error(`Empty response from ${url}`);
      }
      const responseText = responseBuffer.toString('utf-8');
      // Note: Robustness of downloader.download (e.g., returning status codes)
      // would require changes to IDownloader and its implementations.
      // Current implementation relies on downloader throwing an error for non-successful responses.
      return JSON.parse(responseText) as T;
    } catch (e) {
      const error = e as Error;
      log('request: Error during request to %s: %s', url, error.message);
      // TODO: More specific error handling based on actual HTTP status codes
      if (error.message.includes('404')) {
        // Simplistic check
        throw new Error(`GitHub resource not found: ${url}`);
      }
      if (error.message.includes('403')) {
        // Simplistic check for rate limit
        // Attempt to parse rate limit info if possible, or re-throw generic
        const rateLimitInfo = await this.getRateLimit().catch(() => null);
        if (rateLimitInfo) {
          const resetTime = new Date(rateLimitInfo.reset * 1000);
          log(
            'request: GitHub API rate limit likely exceeded. Limit: %d, Remaining: %d, Resets at: %s',
            rateLimitInfo.limit,
            rateLimitInfo.remaining,
            resetTime.toISOString()
          );
          throw new Error(
            `GitHub API rate limit exceeded. Resets at ${resetTime.toISOString()}. Limit: ${rateLimitInfo.limit}, Remaining: ${rateLimitInfo.remaining}`
          );
        }
        throw new Error(`GitHub API request failed (possibly rate limit): ${error.message}`);
      }
      throw error;
    }
  }

  async getLatestRelease(owner: string, repo: string): Promise<GitHubRelease> {
    log('getLatestRelease: Fetching latest release for %s/%s', owner, repo);
    return this.request<GitHubRelease>(`/repos/${owner}/${repo}/releases/latest`);
  }

  async getReleaseByTag(owner: string, repo: string, tag: string): Promise<GitHubRelease> {
    log('getReleaseByTag: Fetching release by tag %s for %s/%s', tag, owner, repo);
    return this.request<GitHubRelease>(`/repos/${owner}/${repo}/releases/tags/${tag}`);
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
