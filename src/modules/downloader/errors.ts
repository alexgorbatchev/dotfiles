/**
 * Development Plan:
 *
 * [x] Define DownloaderError (base class)
 * [x] Define NetworkError
 * [x] Define HttpError (base for HTTP errors)
 * [x] Define NotFoundError (404)
 * [x] Define ForbiddenError (403)
 * [x] Define RateLimitError (429 or 403 with rate limit headers)
 * [x] Define ClientError (other 4xx)
 * [x] Define ServerError (5xx)
 * [x] Export all error classes
 * [ ] Add JSDoc comments for all classes and properties
 * [ ] Write tests for the module. (N/A - Error classes are typically tested via usage in other modules)
 * [ ] Cleanup all linting errors and warnings.
 * [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * [ ] Ensure 100% test coverage for executable code. (N/A)
 * [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { createLogger } from '../logger';

const log = createLogger('downloader/errors');

/**
 * Base error class for all downloader-related errors.
 */
export class DownloaderError extends Error {
  public readonly url: string;

  constructor(message: string, url: string) {
    super(message);
    this.name = 'DownloaderError';
    this.url = url;
    log('DownloaderError created: message=%s, url=%s', message, url);
  }
}

/**
 * Represents an error that occurred at the network level (e.g., DNS resolution failure, connection refused).
 */
export class NetworkError extends DownloaderError {
  public readonly originalError?: Error;

  constructor(message: string, url: string, originalError?: Error) {
    super(message, url);
    this.name = 'NetworkError';
    this.originalError = originalError;
    log('NetworkError created: message=%s, url=%s, originalError=%o', message, url, originalError);
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
    message: string,
    url: string,
    statusCode: number,
    statusText: string,
    responseBody?: string | Buffer | object,
    responseHeaders?: Record<string, string | string[] | undefined>
  ) {
    super(message, url);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.statusText = statusText;
    this.responseBody = responseBody;
    this.responseHeaders = responseHeaders;
    log(
      'HttpError created: message=%s, url=%s, statusCode=%d, statusText=%s, responseBody=%o, responseHeaders=%o',
      message,
      url,
      statusCode,
      statusText,
      responseBody,
      responseHeaders
    );
  }
}

/**
 * Represents an HTTP 404 Not Found error.
 */
export class NotFoundError extends HttpError {
  constructor(
    url: string,
    responseBody?: string | Buffer | object,
    responseHeaders?: Record<string, string | string[] | undefined>
  ) {
    super('Resource not found', url, 404, 'Not Found', responseBody, responseHeaders);
    this.name = 'NotFoundError';
    log(
      'NotFoundError created: url=%s, responseBody=%o, responseHeaders=%o',
      url,
      responseBody,
      responseHeaders
    );
  }
}

/**
 * Represents an HTTP 403 Forbidden error.
 */
export class ForbiddenError extends HttpError {
  constructor(
    url: string,
    responseBody?: string | Buffer | object,
    responseHeaders?: Record<string, string | string[] | undefined>
  ) {
    super('Access forbidden', url, 403, 'Forbidden', responseBody, responseHeaders);
    this.name = 'ForbiddenError';
    log(
      'ForbiddenError created: url=%s, responseBody=%o, responseHeaders=%o',
      url,
      responseBody,
      responseHeaders
    );
  }
}

/**
 * Represents an HTTP 429 Too Many Requests or 403 Forbidden (with rate limit headers) error.
 */
export class RateLimitError extends HttpError {
  public readonly resetTimestamp?: number;

  constructor(
    message: string,
    url: string,
    statusCode: number,
    statusText: string,
    responseBody?: string | Buffer | object,
    responseHeaders?: Record<string, string | string[] | undefined>,
    resetTimestamp?: number
  ) {
    super(message, url, statusCode, statusText, responseBody, responseHeaders);
    this.name = 'RateLimitError';
    this.resetTimestamp = resetTimestamp;
    log(
      'RateLimitError created: message=%s, url=%s, statusCode=%d, statusText=%s, responseBody=%o, responseHeaders=%o, resetTimestamp=%d',
      message,
      url,
      statusCode,
      statusText,
      responseBody,
      responseHeaders,
      resetTimestamp
    );
  }
}

/**
 * Represents a generic HTTP client error (4xx range, excluding 403, 404, 429 handled by specific classes).
 */
export class ClientError extends HttpError {
  constructor(
    url: string,
    statusCode: number,
    statusText: string,
    responseBody?: string | Buffer | object,
    responseHeaders?: Record<string, string | string[] | undefined>
  ) {
    super(
      `Client error: ${statusText}`,
      url,
      statusCode,
      statusText,
      responseBody,
      responseHeaders
    );
    this.name = 'ClientError';
    log(
      'ClientError created: url=%s, statusCode=%d, statusText=%s, responseBody=%o, responseHeaders=%o',
      url,
      statusCode,
      statusText,
      responseBody,
      responseHeaders
    );
  }
}

/**
 * Represents a generic HTTP server error (5xx range).
 */
export class ServerError extends HttpError {
  constructor(
    url: string,
    statusCode: number,
    statusText: string,
    responseBody?: string | Buffer | object,
    responseHeaders?: Record<string, string | string[] | undefined>
  ) {
    super(
      `Server error: ${statusText}`,
      url,
      statusCode,
      statusText,
      responseBody,
      responseHeaders
    );
    this.name = 'ServerError';
    log(
      'ServerError created: url=%s, statusCode=%d, statusText=%s, responseBody=%o, responseHeaders=%o',
      url,
      statusCode,
      statusText,
      responseBody,
      responseHeaders
    );
  }
}
