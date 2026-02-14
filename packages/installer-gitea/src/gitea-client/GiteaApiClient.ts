import type { IGitHubRelease, IGitHubReleaseAsset } from '@dotfiles/core';
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
import crypto from 'node:crypto';
import { GiteaApiClientError } from './GiteaApiClientError';
import type { IGiteaRelease } from './giteaApiTypes';
import { mapGiteaAsset } from './giteaApiTypes';
import type { IGiteaApiClient } from './IGiteaApiClient';
import { messages } from './log-messages';

/**
 * Maps a raw Gitea release response to the shared IGitHubRelease format.
 */
function mapGiteaRelease(raw: IGiteaRelease): IGitHubRelease {
  const assets: IGitHubReleaseAsset[] = raw.assets.map(mapGiteaAsset);
  const result: IGitHubRelease = {
    id: raw.id,
    tag_name: raw.tag_name,
    name: raw.name,
    draft: raw.draft,
    prerelease: raw.prerelease,
    created_at: raw.created_at,
    published_at: raw.published_at,
    assets,
    body: raw.body,
    html_url: raw.html_url,
  };
  return result;
}

/**
 * Client for interacting with Gitea/Forgejo instances via their REST API.
 *
 * Supports any Gitea-compatible instance (Gitea, Forgejo, Codeberg, etc.).
 * Maps Gitea API responses to the shared IGitHubRelease format for compatibility
 * with the existing installer infrastructure.
 *
 * Includes built-in caching support to reduce API calls.
 */
export class GiteaApiClient implements IGiteaApiClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly downloader: IDownloader;
  private readonly cache?: ICache;
  private readonly cacheEnabled: boolean;
  private readonly cacheTtlMs: number;
  private readonly logger: TsLogger;

  constructor(
    parentLogger: TsLogger,
    instanceUrl: string,
    downloader: IDownloader,
    cache?: ICache,
    options?: { token?: string; cacheEnabled?: boolean; cacheTtlMs?: number; },
  ) {
    this.logger = parentLogger.getSubLogger({ name: 'GiteaApiClient' });
    // Normalize the instance URL: strip trailing slash, add /api/v1
    const normalized = instanceUrl.replace(/\/+$/, '');
    this.baseUrl = `${normalized}/api/v1`;
    this.token = options?.token;
    this.downloader = downloader;
    this.cache = cache;
    this.cacheEnabled = options?.cacheEnabled ?? true;
    this.cacheTtlMs = options?.cacheTtlMs ?? 300_000; // 5 minutes default

    const logger = this.logger.getSubLogger({ name: 'constructor' });
    logger.debug(messages.constructor.initialized(this.baseUrl));
    if (this.token) {
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

  private generateCacheKey(endpoint: string, method: string): string {
    let key = `gitea:${method}:${endpoint}`;
    if (this.token && typeof this.token === 'string' && this.token.length > 0) {
      const tokenHash = crypto.createHash('sha256').update(this.token).digest('hex').substring(0, 8);
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
      Accept: 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `token ${this.token}`;
    }

    return headers;
  }

  private async performRequest<T>(url: string, headers: Record<string, string>): Promise<T> {
    const logger = this.logger.getSubLogger({ name: 'performRequest' });
    const responseBuffer = await this.downloader.download(logger, url, { headers });
    if (!responseBuffer || responseBuffer.length === 0) {
      logger.debug(messages.request.emptyResponse(url));
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
    logger.debug(messages.errors.requestFailure(url), error);

    if (error instanceof NotFoundError) {
      logger.debug(messages.errors.notFound(url));
      throw new Error(`Gitea resource not found: ${url}. Status: ${error.statusCode}`);
    }
    if (error instanceof RateLimitError) {
      logger.debug(messages.errors.rateLimit(url));
      throw new GiteaApiClientError(
        `Gitea API rate limit exceeded for ${url}. Status: ${error.statusCode}.`,
        error.statusCode,
        error,
      );
    }
    if (error instanceof ForbiddenError) {
      logger.debug(messages.errors.forbidden(url));
      throw new GiteaApiClientError(
        `Gitea API request forbidden for ${url}. Status: ${error.statusCode}.`,
        error.statusCode,
        error,
      );
    }
    if (error instanceof ClientError) {
      logger.debug(messages.errors.client(url, error.statusCode));
      throw new GiteaApiClientError(
        `Gitea API client error for ${url}. Status: ${error.statusCode} ${error.statusText}.`,
        error.statusCode,
        error,
      );
    }
    if (error instanceof ServerError) {
      logger.debug(messages.errors.server(url, error.statusCode));
      throw new GiteaApiClientError(
        `Gitea API server error for ${url}. Status: ${error.statusCode} ${error.statusText}.`,
        error.statusCode,
        error,
      );
    }
    if (error instanceof HttpError) {
      logger.debug(messages.errors.http(url, error.statusCode));
      throw new GiteaApiClientError(
        `Gitea API HTTP error for ${url}. Status: ${error.statusCode} ${error.statusText}.`,
        error.statusCode,
        error,
      );
    }
    if (error instanceof NetworkError) {
      logger.debug(messages.errors.network(url));
      throw new GiteaApiClientError(`Network error while requesting ${url}: ${error.message}`, undefined, error);
    }

    logger.debug(messages.errors.unknown(url), error);
    if (error instanceof Error) {
      throw new GiteaApiClientError(
        `Unknown error during Gitea API request to ${url}: ${error.message}`,
        undefined,
        error,
      );
    }
    throw new GiteaApiClientError(`Unknown error during Gitea API request to ${url}`);
  }

  async getLatestRelease(owner: string, repo: string): Promise<IGitHubRelease | null> {
    const logger = this.logger.getSubLogger({ name: 'getLatestRelease' });
    logger.debug(messages.releases.fetchingLatest(owner, repo));
    try {
      const raw = await this.request<IGiteaRelease>(`/repos/${owner}/${repo}/releases/latest`);
      return mapGiteaRelease(raw);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Gitea resource not found')) {
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
      const raw = await this.request<IGiteaRelease>(`/repos/${owner}/${repo}/releases/tags/${tag}`);
      return mapGiteaRelease(raw);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Gitea resource not found')) {
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
    options?: { limit?: number; includePrerelease?: boolean; maxResults?: number; },
  ): Promise<IGitHubRelease[]> {
    const logger = this.logger.getSubLogger({ name: 'getAllReleases' });
    logger.debug(messages.releases.fetchingAll(owner, repo));
    const perPage = options?.limit || 30;
    const maxResults = options?.maxResults;
    let page = 1;
    let allReleases: IGitHubRelease[] = [];
    let keepFetching = true;

    while (keepFetching) {
      const endpoint = `/repos/${owner}/${repo}/releases?limit=${perPage}&page=${page}`;
      logger.debug(messages.releases.fetchingPage(page, endpoint));
      const rawPage = await this.request<IGiteaRelease[]>(endpoint);

      if (rawPage.length === 0) {
        keepFetching = false;
      } else {
        const mapped = rawPage.map(mapGiteaRelease);
        allReleases = allReleases.concat(mapped);
        page++;
        if (rawPage.length < perPage) {
          keepFetching = false;
        }
        if (maxResults !== undefined && allReleases.length >= maxResults) {
          allReleases = allReleases.slice(0, maxResults);
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

  async getLatestReleaseTags(owner: string, repo: string, count: number = 5): Promise<string[]> {
    const logger = this.logger.getSubLogger({ name: 'getLatestReleaseTags' });
    logger.debug(messages.releases.fetchingLatestTags(owner, repo, count));

    try {
      const rawReleases = await this.request<IGiteaRelease[]>(
        `/repos/${owner}/${repo}/releases?limit=${count}`,
      );
      const tags: string[] = rawReleases.map((release) => release.tag_name);
      logger.debug(messages.releases.fetchedTags(tags.length));
      return tags;
    } catch (error) {
      logger.debug(messages.releases.fetchTagsError(owner, repo), error);
      return [];
    }
  }
}
