import type { TsLogger } from '@modules/logger';
import type { BaseHttpClient } from '../core/BaseHttpClient';
import { gitHubHttpClientLogMessages } from './log-messages';
import type { GitHubRateLimit, GitHubRelease } from './schemas';
import { gitHubRateLimitSchema, gitHubReleaseSchema } from './schemas';

export interface GitHubHttpClientOptions {
  readonly baseHttpClient: BaseHttpClient;
  readonly logger: TsLogger;
  readonly authToken?: string;
}

export class GitHubHttpClient {
  private readonly client: BaseHttpClient;
  private readonly logger: TsLogger;
  private readonly authToken?: string;

  constructor(options: GitHubHttpClientOptions) {
    this.client = options.baseHttpClient;
    this.logger = options.logger.getSubLogger({ name: 'GitHubHttpClient' });
    this.authToken = options.authToken;
  }

  async getLatestRelease(owner: string, repo: string): Promise<GitHubRelease> {
    const logger = this.logger.getSubLogger({ name: 'getLatestRelease' });
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;

    logger.debug(gitHubHttpClientLogMessages.fetchingLatestRelease(owner, repo));

    const response = await this.client.request({
      method: 'GET',
      url,
      responseFormat: 'json',
      schema: gitHubReleaseSchema,
      authToken: this.authToken,
      headers: this.buildHeaders(),
      cachePolicy: {
        namespace: 'github.releaseMeta',
      },
      errorMapping: {
        defaultCode: 'GITHUB_RELEASE_NOT_FOUND',
        statusCodeMap: {
          404: 'GITHUB_RELEASE_NOT_FOUND',
          403: 'GITHUB_RATE_LIMIT_EXCEEDED',
          429: 'GITHUB_RATE_LIMIT_EXCEEDED',
        },
        schemaErrorCode: 'GITHUB_INVALID_RELEASE_SCHEMA',
        networkErrorCode: 'DOWNLOAD_NETWORK_FAILURE',
        timeoutErrorCode: 'DOWNLOAD_TIMEOUT',
      },
    });

    logger.debug(gitHubHttpClientLogMessages.releaseFetched(response.body.tag_name));
    return response.body;
  }

  async getReleaseByTag(owner: string, repo: string, tag: string): Promise<GitHubRelease> {
    const logger = this.logger.getSubLogger({ name: 'getReleaseByTag' });
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`;

    logger.debug(gitHubHttpClientLogMessages.fetchingReleaseByTag(owner, repo, tag));

    const response = await this.client.request({
      method: 'GET',
      url,
      responseFormat: 'json',
      schema: gitHubReleaseSchema,
      authToken: this.authToken,
      headers: this.buildHeaders(),
      cachePolicy: {
        namespace: 'github.releaseMeta',
      },
      errorMapping: {
        defaultCode: 'GITHUB_RELEASE_NOT_FOUND',
        statusCodeMap: {
          404: 'GITHUB_RELEASE_NOT_FOUND',
          403: 'GITHUB_RATE_LIMIT_EXCEEDED',
          429: 'GITHUB_RATE_LIMIT_EXCEEDED',
        },
        schemaErrorCode: 'GITHUB_INVALID_RELEASE_SCHEMA',
        networkErrorCode: 'DOWNLOAD_NETWORK_FAILURE',
        timeoutErrorCode: 'DOWNLOAD_TIMEOUT',
      },
    });

    logger.debug(gitHubHttpClientLogMessages.releaseFetched(response.body.tag_name));
    return response.body;
  }

  async getRateLimit(): Promise<GitHubRateLimit> {
    const logger = this.logger.getSubLogger({ name: 'getRateLimit' });
    const url = 'https://api.github.com/rate_limit';

    logger.debug(gitHubHttpClientLogMessages.fetchingRateLimit());

    const response = await this.client.request({
      method: 'GET',
      url,
      responseFormat: 'json',
      schema: gitHubRateLimitSchema,
      authToken: this.authToken,
      headers: this.buildHeaders(),
      cachePolicy: {
        namespace: 'github.rateLimit',
      },
      errorMapping: {
        defaultCode: 'GITHUB_RATE_LIMIT_EXCEEDED',
        networkErrorCode: 'DOWNLOAD_NETWORK_FAILURE',
        timeoutErrorCode: 'DOWNLOAD_TIMEOUT',
      },
    });

    logger.debug(gitHubHttpClientLogMessages.rateLimitFetched());
    return response.body;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'dotfiles-generator',
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    return headers;
  }
}
