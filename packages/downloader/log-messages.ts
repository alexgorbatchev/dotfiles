import { createSafeLogMessage, type SafeLogMessageMap } from "@dotfiles/logger";
import type { HttpHeadersMap, HttpResponseBody } from "./types";

export const downloaderLogMessages = {
  strategyCreated: (strategyName: string, detail: string) => createSafeLogMessage(`Created ${strategyName}${detail}`),
  downloadStarted: (url: string) => createSafeLogMessage(`Downloading URL: ${url}`),
  downloadToFileStarted: (url: string, filePath: string) =>
    createSafeLogMessage(`Downloading URL ${url} to file: ${filePath}`),
} satisfies SafeLogMessageMap;

export const proxiedFetchStrategyLogMessages = {
  proxyingRequest: (originalUrl: string, proxiedUrl: string) =>
    createSafeLogMessage(`Proxying request: ${originalUrl} → ${proxiedUrl}`),
} satisfies SafeLogMessageMap;

export const cachedDownloadStrategyLogMessages = {
  strategyWrapped: (strategyName: string, ttlMs: number) =>
    createSafeLogMessage(`Wrapping strategy ${strategyName} with cache, TTL: ${ttlMs} ms`),
  cachingDisabled: (operation: string, key: string, reason: string) =>
    createSafeLogMessage(`Cache disabled, ${operation} for key: ${key} (${reason})`),
  cacheHit: (key: string, strategy: string, size?: number) => {
    const sizeDescription = size !== undefined ? `, size: ${size} bytes` : "";
    return createSafeLogMessage(`Cache hit for key: ${key} (${strategy})${sizeDescription}`);
  },
  cacheStored: (key: string, strategy: string, expiresAt: string, size?: number) => {
    const sizeDescription = size !== undefined ? `, size: ${size} bytes` : "";
    return createSafeLogMessage(`Cached data for key: ${key} (${strategy})${sizeDescription}, expires: ${expiresAt}`);
  },
  cacheStorageFailed: (key: string) => createSafeLogMessage(`Error caching data for key: ${key}`),
  cacheCheckFailed: (key: string) => createSafeLogMessage(`Error checking cache for key: ${key}`),
  cacheMiss: (key: string) => createSafeLogMessage(`No cache entry found for key: ${key}`),
  cacheDisabledForProgress: (url: string) =>
    createSafeLogMessage(`Cache disabled, caching for key: ${url} (reason: progress callback)`),
  readFileForCaching: (path: string) => createSafeLogMessage(`read file for caching: ${path}`),
  downloadedFileExists: (path: string, exists: boolean) =>
    createSafeLogMessage(`Downloaded file exists (${path}): ${exists}`),
  downloadedFileCached: (path: string, size: number) =>
    createSafeLogMessage(`Successfully read file for caching from ${path}, size: ${size} bytes`),
  downloadedFileMissing: (path: string) => createSafeLogMessage(`Downloaded file not found: ${path}`),
  downloadedFileReadFailed: (path: string) => createSafeLogMessage(`Failed to read ${path}`),
  downloadFromStrategy: (strategyName: string) => createSafeLogMessage(`download from ${strategyName}`),
  cachedFileWritten: (path: string) => createSafeLogMessage(`[CachedDownloadStrategy] write ${path}`),
} satisfies SafeLogMessageMap;

export const nodeFetchStrategyLogMessages = {
  constructed: (fsStatus: string) => createSafeLogMessage(`NodeFetchStrategy constructed (fileSystem ${fsStatus})`),
  downloadTimeout: (url: string) => createSafeLogMessage(`Download timeout for ${url}`),
  responseBodyReadFailed: (url: string, reason: unknown) =>
    createSafeLogMessage(`Failed to read response body for ${url}: ${String(reason)}`),
  downloadFailed: (url: string, statusCode: number, statusText: string, responseBody?: string) =>
    createSafeLogMessage(
      `Download failed: url=${url}, statusCode=${statusCode}, statusText=${statusText}, responseBody=${
        responseBody ?? "N/A"
      }`,
    ),
  downloadAttempt: (attempt: number, url: string) => createSafeLogMessage(`Attempt ${attempt}: Downloading ${url}`),
  downloadSuccessful: (url: string, size: number) =>
    createSafeLogMessage(`Download successful for ${url}, size: ${size} bytes`),
  savingToDestination: (destinationPath: string) => createSafeLogMessage(`Saving to destination: ${destinationPath}`),
  savedSuccessfully: (destinationPath: string) =>
    createSafeLogMessage(`Successfully wrote to ${destinationPath} using IFileSystem`),
  downloadAttemptError: (attempt: number, url: string, error: unknown) =>
    createSafeLogMessage(`Error during download attempt ${attempt} for ${url}: ${String(error)}`),
  retryingDownload: (url: string, attempt: number, retryCount: number, retryDelay: number) =>
    createSafeLogMessage(`Retrying download for ${url}, attempt ${attempt}/${retryCount} after ${retryDelay}ms`),
  exhaustedRetries: (url: string) => createSafeLogMessage(`Exhausted retries for ${url}`),
} satisfies SafeLogMessageMap;

export const downloaderErrorLogMessages = {
  errorCreated: (errorName: string, message: string, url: string) =>
    createSafeLogMessage(`${errorName} created: message=${message}, url=${url}`),
  networkErrorCreated: (message: string, url: string, originalError?: Error) =>
    createSafeLogMessage(
      `NetworkError created: message=${message}, url=${url}, originalError=${String(originalError)}`,
    ),
  httpErrorCreated: (
    message: string,
    url: string,
    statusCode: number,
    statusText: string,
    responseBody?: HttpResponseBody,
    responseHeaders?: HttpHeadersMap,
  ) =>
    createSafeLogMessage(
      `HttpError created: message=${message}, url=${url}, statusCode=${statusCode}, statusText=${statusText}, ` +
        `responseBody=${String(responseBody)}, responseHeaders=${JSON.stringify(responseHeaders ?? {})}`,
    ),
  notFoundErrorCreated: (url: string, responseBody?: HttpResponseBody, responseHeaders?: HttpHeadersMap) =>
    createSafeLogMessage(
      `NotFoundError created: url=${url}, responseBody=${String(responseBody)}, responseHeaders=${JSON.stringify(
        responseHeaders ?? {},
      )}`,
    ),
  forbiddenErrorCreated: (url: string, responseBody?: HttpResponseBody, responseHeaders?: HttpHeadersMap) =>
    createSafeLogMessage(
      `ForbiddenError created: url=${url}, responseBody=${String(responseBody)}, responseHeaders=${JSON.stringify(
        responseHeaders ?? {},
      )}`,
    ),
  rateLimitErrorCreated: (
    message: string,
    url: string,
    statusCode: number,
    statusText: string,
    responseBody?: HttpResponseBody,
    responseHeaders?: HttpHeadersMap,
    resetTimestamp?: number,
  ) =>
    createSafeLogMessage(
      `RateLimitError created: message=${message}, url=${url}, statusCode=${statusCode}, statusText=${statusText}, ` +
        `responseBody=${String(responseBody)}, responseHeaders=${JSON.stringify(responseHeaders ?? {})}, ` +
        `resetTimestamp=${String(resetTimestamp)}`,
    ),
  clientErrorCreated: (
    url: string,
    statusCode: number,
    statusText: string,
    responseBody?: HttpResponseBody,
    responseHeaders?: HttpHeadersMap,
  ) =>
    createSafeLogMessage(
      `ClientError created: url=${url}, statusCode=${statusCode}, statusText=${statusText}, responseBody=${String(
        responseBody,
      )}, responseHeaders=${JSON.stringify(responseHeaders ?? {})}`,
    ),
  serverErrorCreated: (
    url: string,
    statusCode: number,
    statusText: string,
    responseBody?: HttpResponseBody,
    responseHeaders?: HttpHeadersMap,
  ) =>
    createSafeLogMessage(
      `ServerError created: url=${url}, statusCode=${statusCode}, statusText=${statusText}, responseBody=${String(
        responseBody,
      )}, responseHeaders=${JSON.stringify(responseHeaders ?? {})}`,
    ),
} satisfies SafeLogMessageMap;
