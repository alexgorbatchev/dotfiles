import type { TsLogger } from '@modules/logger';
import { downloaderErrorLogMessages } from './log-messages';

/**
 * Base error class for all downloader-related errors.
 */
export class DownloaderError extends Error {
  public readonly url: string;

  constructor(parentLogger: TsLogger, message: string, url: string) {
    super(message);
    const logger = parentLogger.getSubLogger({ name: 'DownloaderError' });
    this.name = 'DownloaderError';
    this.url = url;
    logger.debug(downloaderErrorLogMessages.errorCreated('DownloaderError', message, url));
  }
}

/**
 * Represents an error that occurred at the network level (e.g., DNS resolution failure, connection refused).
 */
export class NetworkError extends DownloaderError {
  public readonly originalError?: Error;

  constructor(parentLogger: TsLogger, message: string, url: string, originalError?: Error) {
    super(parentLogger, message, url);
    const logger = parentLogger.getSubLogger({ name: 'NetworkError' });
    this.name = 'NetworkError';
    this.originalError = originalError;
    logger.debug(downloaderErrorLogMessages.networkErrorCreated(message, url, originalError), originalError);
  }
}

/**
 * Base error class for HTTP errors (status code >= 400).
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
    responseHeaders?: Record<string, string | string[] | undefined>
  ) {
    super(parentLogger, message, url);
    const logger = parentLogger.getSubLogger({ name: 'HttpError' });
    this.name = 'HttpError';
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
      }
    );
  }
}

/**
 * Represents an HTTP 404 Not Found error.
 */
export class NotFoundError extends HttpError {
  constructor(
    parentLogger: TsLogger,
    url: string,
    responseBody?: string | Buffer | object,
    responseHeaders?: Record<string, string | string[] | undefined>
  ) {
    super(parentLogger, 'Resource not found', url, 404, 'Not Found', responseBody, responseHeaders);
    const logger = parentLogger.getSubLogger({ name: 'NotFoundError' });
    this.name = 'NotFoundError';
    logger.debug(downloaderErrorLogMessages.notFoundErrorCreated(url, responseBody, responseHeaders), {
      url,
      responseBody,
      responseHeaders,
    });
  }
}

/**
 * Represents an HTTP 403 Forbidden error.
 */
export class ForbiddenError extends HttpError {
  constructor(
    parentLogger: TsLogger,
    url: string,
    responseBody?: string | Buffer | object,
    responseHeaders?: Record<string, string | string[] | undefined>
  ) {
    super(parentLogger, 'Access forbidden', url, 403, 'Forbidden', responseBody, responseHeaders);
    const logger = parentLogger.getSubLogger({ name: 'ForbiddenError' });
    this.name = 'ForbiddenError';
    logger.debug(downloaderErrorLogMessages.forbiddenErrorCreated(url, responseBody, responseHeaders), {
      url,
      responseBody,
      responseHeaders,
    });
  }
}

/**
 * Represents an HTTP 429 Too Many Requests or 403 Forbidden (with rate limit headers) error.
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
    resetTimestamp?: number
  ) {
    super(parentLogger, message, url, statusCode, statusText, responseBody, responseHeaders);
    const logger = parentLogger.getSubLogger({ name: 'RateLimitError' });
    this.name = 'RateLimitError';
    this.resetTimestamp = resetTimestamp;
    logger.debug(
      downloaderErrorLogMessages.rateLimitErrorCreated(
        message,
        url,
        statusCode,
        statusText,
        responseBody,
        responseHeaders,
        resetTimestamp
      ),
      {
        url,
        statusCode,
        statusText,
        responseBody,
        responseHeaders,
        resetTimestamp,
      }
    );
  }
}

/**
 * Represents a generic HTTP client error (4xx range, excluding 403, 404, 429 handled by specific classes).
 */
export class ClientError extends HttpError {
  constructor(
    parentLogger: TsLogger,
    url: string,
    statusCode: number,
    statusText: string,
    responseBody?: string | Buffer | object,
    responseHeaders?: Record<string, string | string[] | undefined>
  ) {
    super(parentLogger, `Client error: ${statusText}`, url, statusCode, statusText, responseBody, responseHeaders);
    const logger = parentLogger.getSubLogger({ name: 'ClientError' });
    this.name = 'ClientError';
    logger.debug(
      downloaderErrorLogMessages.clientErrorCreated(url, statusCode, statusText, responseBody, responseHeaders),
      {
        url,
        statusCode,
        statusText,
        responseBody,
        responseHeaders,
      }
    );
  }
}

/**
 * Represents a generic HTTP server error (5xx range).
 */
export class ServerError extends HttpError {
  constructor(
    parentLogger: TsLogger,
    url: string,
    statusCode: number,
    statusText: string,
    responseBody?: string | Buffer | object,
    responseHeaders?: Record<string, string | string[] | undefined>
  ) {
    super(parentLogger, `Server error: ${statusText}`, url, statusCode, statusText, responseBody, responseHeaders);
    const logger = parentLogger.getSubLogger({ name: 'ServerError' });
    this.name = 'ServerError';
    logger.debug(
      downloaderErrorLogMessages.serverErrorCreated(url, statusCode, statusText, responseBody, responseHeaders),
      {
        url,
        statusCode,
        statusText,
        responseBody,
        responseHeaders,
      }
    );
  }
}
