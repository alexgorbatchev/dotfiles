import { beforeEach, describe, expect, it } from 'bun:test';
import {
  ClientError,
  DownloaderError,
  ForbiddenError,
  HttpError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServerError,
} from '@modules/downloader/errors';
import { TestLogger } from '@testing-helpers';

describe('Downloader Errors', () => {
  let logger: TestLogger;

  beforeEach(() => {
    logger = new TestLogger();
  });

  it('DownloaderError', () => {
    const err = new DownloaderError(logger, 'message', 'url');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('DownloaderError');
    expect(err.message).toBe('message');
    expect(err.url).toBe('url');
    logger.expect(['DEBUG'], ['DownloaderError'], ['DownloaderError created: message=message, url=url']);
  });

  it('NetworkError', () => {
    const err = new NetworkError(logger, 'message', 'url');
    expect(err).toBeInstanceOf(DownloaderError);
    expect(err.name).toBe('NetworkError');
    logger.expect(['DEBUG'], ['NetworkError'], ['NetworkError created: message=message, url=url, originalError=undefined']);
  });

  it('HttpError', () => {
    const err = new HttpError(logger, 'message', 'url', 400, 'Bad Request');
    expect(err).toBeInstanceOf(DownloaderError);
    expect(err.name).toBe('HttpError');
    logger.expect(
      ['DEBUG'],
      ['HttpError'],
      [
        /^HttpError created: message=message, url=url, statusCode=400, statusText=Bad Request, responseBody=undefined, responseHeaders=\{\}(?:[\s\S]*)$/, 
      ]
    );
  });

  it('NotFoundError', () => {
    const err = new NotFoundError(logger, 'url');
    expect(err).toBeInstanceOf(HttpError);
    expect(err.name).toBe('NotFoundError');
    expect(err.statusCode).toBe(404);
    logger.expect(
      ['DEBUG'],
      ['NotFoundError'],
      [/^NotFoundError created: url=url, responseBody=undefined, responseHeaders=\{\}(?:[\s\S]*)$/]
    );
  });

  it('ForbiddenError', () => {
    const err = new ForbiddenError(logger, 'url');
    expect(err).toBeInstanceOf(HttpError);
    expect(err.name).toBe('ForbiddenError');
    expect(err.statusCode).toBe(403);
    logger.expect(
      ['DEBUG'],
      ['ForbiddenError'],
      [/^ForbiddenError created: url=url, responseBody=undefined, responseHeaders=\{\}(?:[\s\S]*)$/]
    );
  });

  it('RateLimitError', () => {
    const err = new RateLimitError(logger, 'message', 'url', 429, 'Too Many Requests');
    expect(err).toBeInstanceOf(HttpError);
    expect(err.name).toBe('RateLimitError');
    expect(err.statusCode).toBe(429);
    logger.expect(
      ['DEBUG'],
      ['RateLimitError'],
      [
        /^RateLimitError created: message=message, url=url, statusCode=429, statusText=Too Many Requests, responseBody=undefined, responseHeaders=\{\}, resetTimestamp=undefined(?:[\s\S]*)$/, 
      ]
    );
  });

  it('ClientError', () => {
    const err = new ClientError(logger, 'url', 400, 'Bad Request');
    expect(err).toBeInstanceOf(HttpError);
    expect(err.name).toBe('ClientError');
    logger.expect(
      ['DEBUG'],
      ['ClientError'],
      [/^ClientError created: url=url, statusCode=400, statusText=Bad Request, responseBody=undefined, responseHeaders=\{\}(?:[\s\S]*)$/]
    );
  });

  it('ServerError', () => {
    const err = new ServerError(logger, 'url', 500, 'Internal Server Error');
    expect(err).toBeInstanceOf(HttpError);
    expect(err.name).toBe('ServerError');
    logger.expect(
      ['DEBUG'],
      ['ServerError'],
      [
        /^ServerError created: url=url, statusCode=500, statusText=Internal Server Error, responseBody=undefined, responseHeaders=\{\}(?:[\s\S]*)$/
      ]
    );
  });
});
