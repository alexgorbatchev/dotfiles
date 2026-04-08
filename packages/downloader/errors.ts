import type { TsLogger } from "@dotfiles/logger";
import { downloaderErrorLogMessages } from "./log-messages";

/**
 * Base error class for all downloader-related errors.
 *
 * This error is used when a download operation fails but doesn't fit into more specific
 * error categories. All downloader errors inherit from this class and include the URL
 * that was being downloaded for better error diagnostics.
 */
export class DownloaderError extends Error {
  public readonly url: string;

  constructor(parentLogger: TsLogger, message: string, url: string) {
    super(message);
    const logger = parentLogger.getSubLogger({ name: "DownloaderError" });
    this.name = "DownloaderError";
    this.url = url;
    logger.debug(downloaderErrorLogMessages.errorCreated("DownloaderError", message, url));
  }
}

/**
 * Represents an error that occurred at the network level.
 *
 * Network errors include DNS resolution failures, connection refused, timeouts,
 * and other low-level network issues that prevent the HTTP request from completing.
 * This error wraps the original error from the network layer for debugging.
 */
export class NetworkError extends DownloaderError {
  public readonly originalError?: Error;

  constructor(parentLogger: TsLogger, message: string, url: string, originalError?: Error) {
    super(parentLogger, message, url);
    const logger = parentLogger.getSubLogger({ name: "NetworkError" });
    this.name = "NetworkError";
    this.originalError = originalError;
    logger.debug(downloaderErrorLogMessages.networkErrorCreated(message, url, originalError), originalError);
  }
}

/**
 * Base error class for HTTP errors with status code >= 400.
 *
 * This error is thrown when the server responds with an error status code.
 * It includes the status code, status text, response body, and headers for
 * detailed error analysis. Specific HTTP errors (404, 403, etc.) extend this class.
 */
export class HttpError extends DownloaderError {
  public readonly statusCode: number;
  public readonly statusText: string;
  public readonly responseBody?: string | Buffer | object;
  public readonly responseHeaders?: Record<string, string | string[] | undefined>;

  constructor(
    parentLogger: TsLogger,
    message: string,
    url: string,
    statusCode: number,
    statusText: string,
    responseBody?: string | Buffer | object,
    responseHeaders?: Record<string, string | string[] | undefined>,
  ) {
    super(parentLogger, message, url);
    const logger = parentLogger.getSubLogger({ name: "HttpError" });
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.statusText = statusText;
    this.responseBody = responseBody;
    this.responseHeaders = responseHeaders;
    logger.debug(
      downloaderErrorLogMessages.httpErrorCreated(message, url, statusCode, statusText, responseBody, responseHeaders),
      {
        url,
        statusCode,
        statusText,
        responseBody,
        responseHeaders,
      },
    );
  }
}

/**
 * Represents an HTTP 404 Not Found error.
 *
 * This error is thrown when the requested resource does not exist on the server.
 * It's a specific case of HttpError for 404 status codes.
 */
export class NotFoundError extends HttpError {
  constructor(
    parentLogger: TsLogger,
    url: string,
    responseBody?: string | Buffer | object,
    responseHeaders?: Record<string, string | string[] | undefined>,
  ) {
    super(parentLogger, "Resource not found", url, 404, "Not Found", responseBody, responseHeaders);
    const logger = parentLogger.getSubLogger({ name: "NotFoundError" });
    this.name = "NotFoundError";
    logger.debug(downloaderErrorLogMessages.notFoundErrorCreated(url, responseBody, responseHeaders), {
      url,
      responseBody,
      responseHeaders,
    });
  }
}

/**
 * Represents an HTTP 403 Forbidden error.
 *
 * This error is thrown when the server refuses to authorize the request.
 * Common causes include insufficient permissions, authentication failures,
 * or IP-based access restrictions. It's a specific case of HttpError for 403 status codes.
 */
export class ForbiddenError extends HttpError {
  constructor(
    parentLogger: TsLogger,
    url: string,
    responseBody?: string | Buffer | object,
    responseHeaders?: Record<string, string | string[] | undefined>,
  ) {
    super(parentLogger, "Access forbidden", url, 403, "Forbidden", responseBody, responseHeaders);
    const logger = parentLogger.getSubLogger({ name: "ForbiddenError" });
    this.name = "ForbiddenError";
    logger.debug(downloaderErrorLogMessages.forbiddenErrorCreated(url, responseBody, responseHeaders), {
      url,
      responseBody,
      responseHeaders,
    });
  }
}

/**
 * Represents an HTTP 429 Too Many Requests or rate-limited 403 Forbidden error.
 *
 * This error is thrown when the server indicates that the client has exceeded
 * rate limits. It may include a resetTimestamp indicating when the rate limit
 * will be lifted. This is commonly used by APIs like GitHub that enforce
 * rate limiting on requests.
 */
export class RateLimitError extends HttpError {
  public readonly resetTimestamp?: number;

  constructor(
    parentLogger: TsLogger,
    message: string,
    url: string,
    statusCode: number,
    statusText: string,
    responseBody?: string | Buffer | object,
    responseHeaders?: Record<string, string | string[] | undefined>,
    resetTimestamp?: number,
  ) {
    super(parentLogger, message, url, statusCode, statusText, responseBody, responseHeaders);
    const logger = parentLogger.getSubLogger({ name: "RateLimitError" });
    this.name = "RateLimitError";
    this.resetTimestamp = resetTimestamp;
    logger.debug(
      downloaderErrorLogMessages.rateLimitErrorCreated(
        message,
        url,
        statusCode,
        statusText,
        responseBody,
        responseHeaders,
        resetTimestamp,
      ),
      {
        url,
        statusCode,
        statusText,
        responseBody,
        responseHeaders,
        resetTimestamp,
      },
    );
  }
}

/**
 * Represents a generic HTTP client error in the 4xx range.
 *
 * This error is used for 4xx status codes that don't have specific error classes
 * (excludes 403, 404, and 429 which have dedicated error types). It indicates
 * that the request was malformed or invalid in some way.
 */
export class ClientError extends HttpError {
  constructor(
    parentLogger: TsLogger,
    url: string,
    statusCode: number,
    statusText: string,
    responseBody?: string | Buffer | object,
    responseHeaders?: Record<string, string | string[] | undefined>,
  ) {
    super(parentLogger, `Client error: ${statusText}`, url, statusCode, statusText, responseBody, responseHeaders);
    const logger = parentLogger.getSubLogger({ name: "ClientError" });
    this.name = "ClientError";
    logger.debug(
      downloaderErrorLogMessages.clientErrorCreated(url, statusCode, statusText, responseBody, responseHeaders),
      {
        url,
        statusCode,
        statusText,
        responseBody,
        responseHeaders,
      },
    );
  }
}

/**
 * Represents a generic HTTP server error in the 5xx range.
 *
 * This error is thrown when the server encounters an internal error while
 * processing the request. It indicates a problem on the server side rather
 * than with the client's request.
 */
export class ServerError extends HttpError {
  constructor(
    parentLogger: TsLogger,
    url: string,
    statusCode: number,
    statusText: string,
    responseBody?: string | Buffer | object,
    responseHeaders?: Record<string, string | string[] | undefined>,
  ) {
    super(parentLogger, `Server error: ${statusText}`, url, statusCode, statusText, responseBody, responseHeaders);
    const logger = parentLogger.getSubLogger({ name: "ServerError" });
    this.name = "ServerError";
    logger.debug(
      downloaderErrorLogMessages.serverErrorCreated(url, statusCode, statusText, responseBody, responseHeaders),
      {
        url,
        statusCode,
        statusText,
        responseBody,
        responseHeaders,
      },
    );
  }
}
