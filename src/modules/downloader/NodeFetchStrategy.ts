/**
 * @file generator/src/modules/downloader/NodeFetchStrategy.ts
 * @description Download strategy using Node.js's native fetch API.
 *
 * Development Plan:
 *
 * [x] Implement basic fetch and retry logic.
 * [x] Handle successful download to buffer or file.
 * [x] Add progress reporting.
 * [x] Import custom error classes.
 * [x] Throw NetworkError for connection issues or pre-response errors.
 * [x] If response not ok:
 *   [x] Read response body as text for error details.
 *   [x] Convert response headers to a Record.
 *   [x] Throw NotFoundError for 404.
 *   [x] Throw RateLimitError for 403 (with rate limit headers) or 429.
 *     [x] Extract resetTimestamp from X-RateLimit-Reset or Retry-After.
 *   [x] Throw ForbiddenError for 403 (without rate limit headers).
 *   [x] Throw ClientError for other 4xx.
 *   [x] Throw ServerError for 5xx.
 *   [x] Throw HttpError for other non-ok statuses.
 * [x] Ensure originalError is included in NetworkError where applicable.
 * [x] Refactor to use IFileSystem for file writing. (Verified)
 * [x] Update development plan at the top of the file. (This is the update for DI verification)
 * [x] Write tests for the module. (Initial tests created in NodeFetchStrategy.test.ts, to be updated for DI)
 * [ ] Cleanup all linting errors and warnings.
 * [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * [ ] Ensure 100% test coverage for executable code (pending test run and linting).
 * [ ] Update the memory bank with the new information when all tasks are complete.
 */

import type { DownloadStrategy } from './DownloadStrategy';
import type { DownloadOptions } from './IDownloader';
import type { IFileSystem } from '../file-system/IFileSystem'; // Corrected import
// Removed: import { createWriteStream } from 'memfs';
// Removed: import { pipeline } from 'node:stream/promises';
// Removed: import { Readable } from 'node:stream';
import {
  NetworkError,
  HttpError,
  NotFoundError,
  ForbiddenError,
  RateLimitError,
  ClientError,
  ServerError,
} from './errors';
import { createLogger } from '../logger';

const log = createLogger('NodeFetchStrategy');

export class NodeFetchStrategy implements DownloadStrategy {
  public readonly name = 'node-fetch';
  private readonly fileSystem: IFileSystem;

  constructor(fileSystem: IFileSystem) {
    log('constructor: fileSystem=%o', fileSystem ? 'provided' : 'undefined');
    this.fileSystem = fileSystem;
  }

  public async isAvailable(): Promise<boolean> {
    // Node.js fetch is generally available in modern Node versions.
    // Bun also provides a compatible fetch.
    return typeof fetch === 'function';
  }

  private getResponseHeaders(headers: Headers): Record<string, string | string[] | undefined> {
    const result: Record<string, string | string[] | undefined> = {};
    headers.forEach((value, key) => {
      // For simplicity, we're not handling multi-value headers explicitly here
      // as 'getSetCookie' is specific and 'getAll' is deprecated.
      // Most common headers are single value. If multi-value is needed,
      // this part might need refinement based on specific header names.
      result[key] = value;
    });
    return result;
  }

  private parseRateLimitReset(headers: Headers): number | undefined {
    const rateLimitResetHeader = headers.get('X-RateLimit-Reset');
    if (rateLimitResetHeader) {
      const timestamp = parseInt(rateLimitResetHeader, 10);
      if (!isNaN(timestamp)) {
        return timestamp * 1000; // Convert seconds to milliseconds
      }
    }
    const retryAfterHeader = headers.get('Retry-After');
    if (retryAfterHeader) {
      const delaySeconds = parseInt(retryAfterHeader, 10);
      if (!isNaN(delaySeconds)) {
        return Date.now() + delaySeconds * 1000;
      }
      // Check if it's an HTTP-date
      const dateTimestamp = Date.parse(retryAfterHeader);
      if (!isNaN(dateTimestamp)) {
        return dateTimestamp;
      }
    }
    return undefined;
  }

  public async download(url: string, options: DownloadOptions): Promise<Buffer | void> {
    const {
      headers,
      timeout,
      onProgress,
      destinationPath,
      retryCount = 0,
      retryDelay = 1000,
    } = options;

    let attempt = 0;
    while (attempt <= retryCount) {
      try {
        const controller = new AbortController();
        let timeoutId: NodeJS.Timeout | undefined;

        if (timeout) {
          timeoutId = setTimeout(() => {
            log('Download timeout for %s', url);
            controller.abort();
          }, timeout);
        }

        log('Attempt %d: Downloading %s', attempt + 1, url);
        const response = await fetch(url, {
          headers,
          signal: controller.signal,
        });

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          let responseBody: string | undefined;
          try {
            responseBody = await response.text();
          } catch (e) {
            log('Failed to read response body for error: %s, error: %o', url, e);
          }
          const responseHeaders = this.getResponseHeaders(response.headers);
          const statusCode = response.status;
          const statusText = response.statusText;

          log(
            'Download failed: url=%s, statusCode=%d, statusText=%s, responseBody=%s',
            url,
            statusCode,
            statusText,
            responseBody?.substring(0, 100) // Log snippet
          );

          if (statusCode === 404) {
            throw new NotFoundError(url, responseBody, responseHeaders);
          }

          const resetTimestamp = this.parseRateLimitReset(response.headers);

          if (statusCode === 403) {
            if (resetTimestamp) {
              throw new RateLimitError(
                'Forbidden: Rate limit likely exceeded',
                url,
                statusCode,
                statusText,
                responseBody,
                responseHeaders,
                resetTimestamp
              );
            }
            throw new ForbiddenError(url, responseBody, responseHeaders);
          }

          if (statusCode === 429) {
            throw new RateLimitError(
              'Too Many Requests',
              url,
              statusCode,
              statusText,
              responseBody,
              responseHeaders,
              resetTimestamp
            );
          }

          if (statusCode >= 400 && statusCode < 500) {
            throw new ClientError(url, statusCode, statusText, responseBody, responseHeaders);
          }

          if (statusCode >= 500 && statusCode < 600) {
            throw new ServerError(url, statusCode, statusText, responseBody, responseHeaders);
          }

          // Fallback HttpError
          throw new HttpError(
            `HTTP error ${statusCode}`,
            url,
            statusCode,
            statusText,
            responseBody,
            responseHeaders
          );
        }

        const totalBytes = Number(response.headers.get('content-length')) || undefined;
        let bytesDownloaded = 0;

        if (onProgress && totalBytes !== undefined) {
          onProgress({ bytesDownloaded, totalBytes, percentage: 0 });
        } else if (onProgress) {
          onProgress({ bytesDownloaded });
        }

        const chunks: Buffer[] = [];
        const reader = response.body?.getReader();
        if (!reader) {
          // This case should ideally be caught by response.ok or fetch error,
          // but as a safeguard:
          throw new NetworkError('Response body is not readable.', url);
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(Buffer.from(value));
            bytesDownloaded += value.length;
            if (onProgress) {
              const percentage = totalBytes ? (bytesDownloaded / totalBytes) * 100 : undefined;
              onProgress({ bytesDownloaded, totalBytes, percentage });
            }
          }
        }

        const resultBuffer = Buffer.concat(chunks);
        log('Download successful for %s, size: %d bytes', url, resultBuffer.length);

        if (destinationPath) {
          log('Saving to destination: %s', destinationPath);
          // Use IFileSystem to write the buffer
          await this.fileSystem.writeFile(destinationPath, resultBuffer);
          log('Successfully wrote to %s using IFileSystem', destinationPath);
          return;
        } else {
          return resultBuffer;
        }
      } catch (error: any) {
        log('Error during download attempt %d for %s: %o', attempt + 1, url, error);
        if (attempt < retryCount) {
          attempt++;
          log(
            'Retrying download for %s, attempt %d/%d after %dms',
            url,
            attempt + 1,
            retryCount + 1,
            retryDelay
          );
          if (onProgress) {
            // onProgress({ bytesDownloaded: 0, totalBytes: undefined, percentage: 0, status: `Retrying (${attempt}/${retryCount})...` });
          }
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        } else {
          if (error instanceof HttpError || error instanceof NetworkError) {
            throw error; // Rethrow custom errors directly
          }
          // Wrap other errors in NetworkError
          let message = `Failed to download ${url}`;
          if (error.name === 'AbortError') {
            message = `Download timed out for ${url}`;
          } else if (error instanceof Error) {
            message = error.message;
          }
          throw new NetworkError(message, url, error instanceof Error ? error : undefined);
        }
      }
    }
    // Fallback, should ideally not be reached if retryCount >= 0
    log('Exhausted retries for %s', url);
    throw new NetworkError(`Download failed for ${url} after ${retryCount} retries.`, url);
  }
}
