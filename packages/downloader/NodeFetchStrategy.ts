import type { IFileSystem } from "@dotfiles/file-system";
import type { TsLogger } from "@dotfiles/logger";
import { proxyFetch, type ProxyFetchConfig } from "@dotfiles/utils";
import {
  ClientError,
  ForbiddenError,
  HttpError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServerError,
} from "./errors";
import type { IDownloadOptions, ProgressCallback } from "./IDownloader";
import type { IDownloadStrategy } from "./IDownloadStrategy";
import { nodeFetchStrategyLogMessages } from "./log-messages";
import type { HttpHeadersMap } from "./types";

interface ISetupDownloadRequestResult {
  response: Response;
  timeoutId?: NodeJS.Timeout;
}

export class NodeFetchStrategy implements IDownloadStrategy {
  public readonly name = "node-fetch";
  private readonly logger: TsLogger;
  private readonly fileSystem: IFileSystem;
  private readonly proxyConfig: ProxyFetchConfig | undefined;

  constructor(parentLogger: TsLogger, fileSystem: IFileSystem, proxyConfig?: ProxyFetchConfig) {
    this.logger = parentLogger.getSubLogger({ name: "NodeFetchStrategy" });
    this.logger.debug(nodeFetchStrategyLogMessages.constructed(fileSystem ? "provided" : "undefined"));
    this.fileSystem = fileSystem;
    this.proxyConfig = proxyConfig;
  }

  public async isAvailable(): Promise<boolean> {
    // Node.js fetch is generally available in modern Node versions.
    // Bun also provides a compatible fetch.
    return typeof fetch === "function";
  }

  private getResponseHeaders(headers: Headers): HttpHeadersMap {
    const result: HttpHeadersMap = {};
    headers.forEach((value, key) => {
      // For simplicity, we're not handling multi-value headers explicitly here
      // as 'getSetCookie' is specific and 'getAll' is deprecated.
      // Most common headers are single value. If multi-value is needed,
      // this part might need refinement based on specific header names.
      result[key] = value;
    });
    return result;
  }

  public parseRateLimitReset(headers: Headers): number | undefined {
    const rateLimitResetHeader = headers.get("X-RateLimit-Reset");
    if (rateLimitResetHeader) {
      const timestamp = parseInt(rateLimitResetHeader, 10);
      if (!Number.isNaN(timestamp)) {
        return timestamp * 1000; // Convert seconds to milliseconds
      }
    }
    const retryAfterHeader = headers.get("Retry-After");
    if (retryAfterHeader) {
      const delaySeconds = parseInt(retryAfterHeader, 10);
      if (!Number.isNaN(delaySeconds)) {
        return Date.now() + delaySeconds * 1000;
      }
      // Check if it's an HTTP-date
      const dateTimestamp = Date.parse(retryAfterHeader);
      if (!Number.isNaN(dateTimestamp)) {
        return dateTimestamp;
      }
    }
    return undefined;
  }

  private async setupDownloadRequest(
    url: string,
    headers: Record<string, string> | undefined,
    timeout: number | undefined,
  ): Promise<ISetupDownloadRequestResult> {
    const controller = new AbortController();
    let timeoutId: NodeJS.Timeout | undefined;

    if (timeout) {
      timeoutId = setTimeout(() => {
        this.logger.debug(nodeFetchStrategyLogMessages.downloadTimeout(url));
        controller.abort();
      }, timeout);
    }

    const response = await proxyFetch(
      url,
      {
        headers,
        signal: controller.signal,
      },
      this.proxyConfig,
    );

    return { response, timeoutId };
  }

  private async handleErrorResponse(response: Response, url: string): Promise<never> {
    let responseBody: string | undefined;
    try {
      responseBody = await response.text();
    } catch (error) {
      this.logger.debug(nodeFetchStrategyLogMessages.responseBodyReadFailed(url, error));
    }

    const responseHeaders = this.getResponseHeaders(response.headers);
    const statusCode = response.status;
    const statusText = response.statusText;

    this.logger.debug(
      nodeFetchStrategyLogMessages.downloadFailed(url, statusCode, statusText, responseBody?.substring(0, 100)),
    );

    if (statusCode === 404) {
      throw new NotFoundError(this.logger, url, responseBody, responseHeaders);
    }

    const resetTimestamp = this.parseRateLimitReset(response.headers);

    if (statusCode === 403) {
      if (resetTimestamp) {
        throw new RateLimitError(
          this.logger,
          "Forbidden: Rate limit likely exceeded",
          url,
          statusCode,
          statusText,
          responseBody,
          responseHeaders,
          resetTimestamp,
        );
      }
      throw new ForbiddenError(this.logger, url, responseBody, responseHeaders);
    }

    if (statusCode === 429) {
      throw new RateLimitError(
        this.logger,
        "Too Many Requests",
        url,
        statusCode,
        statusText,
        responseBody,
        responseHeaders,
        resetTimestamp,
      );
    }

    if (statusCode >= 400 && statusCode < 500) {
      throw new ClientError(this.logger, url, statusCode, statusText, responseBody, responseHeaders);
    }

    if (statusCode >= 500 && statusCode < 600) {
      throw new ServerError(this.logger, url, statusCode, statusText, responseBody, responseHeaders);
    }

    // Fallback HttpError
    throw new HttpError(
      this.logger,
      `HTTP error ${statusCode}`,
      url,
      statusCode,
      statusText,
      responseBody,
      responseHeaders,
    );
  }

  private async processResponseStream(response: Response, url: string, onProgress?: ProgressCallback): Promise<Buffer> {
    const contentLength = response.headers.get("content-length");
    let totalBytes: number | null = null;
    if (contentLength) {
      const parsedTotal = parseInt(contentLength, 10);
      if (!Number.isNaN(parsedTotal)) {
        totalBytes = parsedTotal;
      }
    }

    let bytesDownloaded = 0;

    if (onProgress) {
      onProgress(bytesDownloaded, totalBytes);
    }

    const chunks: Buffer[] = [];
    const reader = response.body?.getReader();
    if (!reader) {
      throw new NetworkError(this.logger, "Response body is not readable.", url);
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(Buffer.from(value));
        bytesDownloaded += value.length;
        if (onProgress) {
          onProgress(bytesDownloaded, totalBytes);
        }
      }
    }

    return Buffer.concat(chunks);
  }

  private async handleDownloadAttempt(
    url: string,
    options: IDownloadOptions,
    attempt: number,
  ): Promise<Buffer | undefined> {
    const { headers, timeout, onProgress, destinationPath } = options;

    this.logger.debug(nodeFetchStrategyLogMessages.downloadAttempt(attempt + 1, url));

    const { response, timeoutId } = await this.setupDownloadRequest(url, headers, timeout);

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      await this.handleErrorResponse(response, url);
    }

    const resultBuffer = await this.processResponseStream(response, url, onProgress);
    this.logger.debug(nodeFetchStrategyLogMessages.downloadSuccessful(url, resultBuffer.length));

    if (destinationPath) {
      this.logger.debug(nodeFetchStrategyLogMessages.savingToDestination(destinationPath));
      await this.fileSystem.writeFile(destinationPath, resultBuffer);
      this.logger.debug(nodeFetchStrategyLogMessages.savedSuccessfully(destinationPath));
      return;
    }

    return resultBuffer;
  }

  private handleDownloadError(
    error: unknown,
    url: string,
    attempt: number,
    retryCount: number,
    _onProgress?: ProgressCallback,
  ): void {
    this.logger.debug(nodeFetchStrategyLogMessages.downloadAttemptError(attempt + 1, url, error));

    if (attempt >= retryCount) {
      if (error instanceof HttpError || error instanceof NetworkError) {
        throw error;
      }

      let message = `Failed to download ${url}`;
      if (error instanceof Error && error.name === "AbortError") {
        message = `Download timed out for ${url}`;
      } else if (error instanceof Error) {
        message = error.message;
      }
      throw new NetworkError(this.logger, message, url, error instanceof Error ? error : undefined);
    }
  }

  private async retryDownload(
    url: string,
    attempt: number,
    retryCount: number,
    retryDelay: number,
    onProgress?: ProgressCallback,
  ): Promise<void> {
    this.logger.debug(nodeFetchStrategyLogMessages.retryingDownload(url, attempt + 2, retryCount + 1, retryDelay));
    if (onProgress) {
      // onProgress({
      //   bytesDownloaded: 0,
      //   totalBytes: undefined,
      //   percentage: 0,
      //   status: `Retrying (${attempt}/${retryCount})...`,
      // });
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }

  public async download(url: string, options: IDownloadOptions): Promise<Buffer | undefined> {
    const { retryCount = 0, retryDelay = 1000, onProgress } = options;

    let attempt = 0;
    while (attempt <= retryCount) {
      try {
        return await this.handleDownloadAttempt(url, options, attempt);
      } catch (error: unknown) {
        this.handleDownloadError(error, url, attempt, retryCount, onProgress);

        if (attempt < retryCount) {
          await this.retryDownload(url, attempt, retryCount, retryDelay, onProgress);
          attempt++;
        }
      }
    }

    // Fallback, should ideally not be reached if retryCount >= 0
    this.logger.debug(nodeFetchStrategyLogMessages.exhaustedRetries(url));
    throw new NetworkError(this.logger, `Download failed for ${url} after ${retryCount} retries.`, url);
  }
}
