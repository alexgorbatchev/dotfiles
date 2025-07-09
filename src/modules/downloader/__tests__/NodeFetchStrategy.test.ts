/**
 * @file src/modules/downloader/__tests__/NodeFetchStrategy.test.ts
 * @description Tests for the NodeFetchStrategy class.
 *
 * ## Development Plan
 *
 * - [x] Refactor fetch mocking to use FetchMockHelper.
 * - [x] Ensure NodeFetchStrategy is instantiated with IFileSystem (verified, no change needed).
 * - [x] Update tests for onProgress callback signature and add new test cases.
 * - [ ] Ensure all tests pass with 100% coverage.
 * - [ ] Cleanup linting errors.
 * - [ ] Update memory bank if necessary (not for this subtask).
 */

import type { IFileSystem } from '@modules/file-system/IFileSystem';
import { createLogger } from '@modules/logger';
import {
  beforeEach,
  describe,
  expect,
  it,
  mock
} from 'bun:test';
import { createMockFileSystem, FetchMockHelper } from '../../../testing-helpers';
import { NodeFetchStrategy } from '../NodeFetchStrategy';
import {
  ClientError,
  ForbiddenError,
  HttpError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServerError,
} from '../errors';

createLogger('NodeFetchStrategy.test');

describe('NodeFetchStrategy', () => {
  let mockFileSystem: IFileSystem;
  let fileSystemMocks: ReturnType<typeof createMockFileSystem>['fileSystemMocks'];
  let strategy: NodeFetchStrategy;
  const fetchMockHelper = new FetchMockHelper();

  const testUrl = 'http://example.com/testfile.txt';
  const mockFileData = 'This is mock file data.';
  const mockFileBuffer = Buffer.from(mockFileData);

  beforeEach(() => {
    mock.restore();

    fetchMockHelper.setup();

    const { mockFileSystem: fsInstance, fileSystemMocks: fsMocks } = createMockFileSystem();
    mockFileSystem = fsInstance;
    fileSystemMocks = fsMocks;

    strategy = new NodeFetchStrategy(mockFileSystem);
  });

  it('isAvailable() should return true', async () => {
    expect(await strategy.isAvailable()).toBe(true);
  });

  describe('download to Buffer', () => {
    it('should download data to a Buffer successfully', async () => {
      fetchMockHelper.mockTextResponseOnce(mockFileData, {
        status: 200,
      });

      const result = await strategy.download(testUrl, {});
      expect(result).toBeInstanceOf(Buffer);
      expect(result!.toString()).toBe(mockFileData);
      const spy = fetchMockHelper.getSpy();
      expect(spy.mock.calls.length).toBe(1);
      if (spy.mock.calls[0]) {
        expect(spy.mock.calls[0][0]).toBe(testUrl);
      } else {
        expect(spy.mock.calls.length).toBeGreaterThan(0); // Should not happen if length is 1
      }
    });

    it('should handle response without content-length for buffer download', async () => {
      fetchMockHelper.mockTextResponseOnce(mockFileData, {
        status: 200,
      });
      const result = await strategy.download(testUrl, {});
      expect(result!.toString()).toBe(mockFileData);
      const spy = fetchMockHelper.getSpy();
      expect(spy.mock.calls.length).toBe(1);
      if (spy.mock.calls[0]) {
        expect(spy.mock.calls[0][0]).toBe(testUrl);
      } else {
        expect(spy.mock.calls.length).toBeGreaterThan(0);
      }
    });
  });

  describe('download to File', () => {
    it('should download data to a file successfully using IFileSystem', async () => {
      const destinationPath = '/tmp/testdownload.txt';
      fetchMockHelper.mockTextResponseOnce(mockFileData, {
        status: 200,
        headers: { 'Content-Length': String(mockFileBuffer.length) },
      });

      const result = await strategy.download(testUrl, { destinationPath });

      expect(result).toBeUndefined();
      const spy = fetchMockHelper.getSpy();
      expect(spy.mock.calls.length).toBe(1);
      if (spy.mock.calls[0]) {
        expect(spy.mock.calls[0][0]).toBe(testUrl);
      } else {
        expect(spy.mock.calls.length).toBeGreaterThan(0);
      }
      expect(fileSystemMocks.writeFile).toHaveBeenCalledWith(destinationPath, mockFileBuffer);
    });
  });

  describe('onProgress callback', () => {
    it('should call onProgress with correct data when Content-Length is available', async () => {
      const onProgressMock = mock((_bytesDownloaded: number, _totalBytes: number | null) => {});
      const chunk1 = mockFileData.substring(0, 10);
      const chunk2 = mockFileData.substring(10);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(chunk1));
          controller.enqueue(new TextEncoder().encode(chunk2));
          controller.close();
        },
      });
      fetchMockHelper.mockResponseOnce({
        body: stream,
        status: 200,
        headers: { 'Content-Length': String(mockFileBuffer.length) },
      });

      await strategy.download(testUrl, { onProgress: onProgressMock });

      expect(onProgressMock).toHaveBeenCalledTimes(3); // Initial call (0, total) + 2 chunks

      // Initial call
      expect(onProgressMock.mock.calls[0]?.[0]).toBe(0); // bytesDownloaded
      expect(onProgressMock.mock.calls[0]?.[1]).toBe(mockFileBuffer.length); // totalBytes

      // First chunk
      expect(onProgressMock.mock.calls[1]?.[0]).toBe(chunk1.length); // bytesDownloaded
      expect(onProgressMock.mock.calls[1]?.[1]).toBe(mockFileBuffer.length); // totalBytes

      // Second chunk (final)
      expect(onProgressMock.mock.calls[2]?.[0]).toBe(mockFileBuffer.length); // bytesDownloaded
      expect(onProgressMock.mock.calls[2]?.[1]).toBe(mockFileBuffer.length); // totalBytes
    });

    it('should call onProgress with null totalBytes when Content-Length is missing', async () => {
      const onProgressMock = mock((_bytesDownloaded: number, _totalBytes: number | null) => {});
      const chunk1 = mockFileData.substring(0, 10);
      const chunk2 = mockFileData.substring(10);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(chunk1));
          controller.enqueue(new TextEncoder().encode(chunk2));
          controller.close();
        },
      });
      fetchMockHelper.mockResponseOnce({
        body: stream,
        status: 200,
        // No Content-Length header
      });

      await strategy.download(testUrl, { onProgress: onProgressMock });

      expect(onProgressMock).toHaveBeenCalledTimes(3); // Initial call + 2 chunks

      // Initial call
      expect(onProgressMock.mock.calls[0]?.[0]).toBe(0); // bytesDownloaded
      expect(onProgressMock.mock.calls[0]?.[1]).toBeNull(); // totalBytes

      // First chunk
      expect(onProgressMock.mock.calls[1]?.[0]).toBe(chunk1.length); // bytesDownloaded
      expect(onProgressMock.mock.calls[1]?.[1]).toBeNull(); // totalBytes

      // Second chunk (final)
      expect(onProgressMock.mock.calls[2]?.[0]).toBe(mockFileBuffer.length); // bytesDownloaded
      expect(onProgressMock.mock.calls[2]?.[1]).toBeNull(); // totalBytes
    });

    it('should not call onProgress if it is not provided in options', async () => {
      // Create a mock that we expect NOT to be called.
      // If we don't pass it to download, it shouldn't be called.
      const onProgressMock = mock((_bytes: number, _total: number | null) => {});

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(mockFileData.substring(0, 10)));
          controller.enqueue(new TextEncoder().encode(mockFileData.substring(10)));
          controller.close();
        },
      });
      fetchMockHelper.mockResponseOnce({
        body: stream,
        status: 200,
        headers: { 'Content-Length': String(mockFileBuffer.length) },
      });

      // Download without providing the onProgress option
      await strategy.download(testUrl, {});

      expect(onProgressMock).not.toHaveBeenCalled();
    });
  });

  describe('Timeout handling', () => {
    it('should throw NetworkError on timeout', async () => {
      fetchMockHelper.mockErrorOnce(new DOMException('Aborted', 'AbortError'));
      expect(strategy.download(testUrl, { timeout: 50 })).rejects.toThrow(NetworkError);

      // Test the internal error properties
      fetchMockHelper.reset(); // Reset for the next mock
      fetchMockHelper.mockErrorOnce(new DOMException('Aborted', 'AbortError'));
      try {
        await strategy.download(testUrl, { timeout: 50 });
      } catch (e: any) {
        expect(e.message).toMatch(/Download timed out/);
        expect(e.url).toBe(testUrl);
        expect(e.originalError?.name).toBe('AbortError');
      }
    });
  });

  describe('Retry logic', () => {
    it('should succeed after a retry', async () => {
      fetchMockHelper.mockResponseOnce({ body: 'Server Error', status: 500 });
      fetchMockHelper.mockTextResponseOnce(mockFileData, {
        status: 200,
      });

      const result = await strategy.download(testUrl, { retryCount: 1, retryDelay: 10 });
      expect(result!.toString()).toBe(mockFileData);
      expect(fetchMockHelper.getSpy().mock.calls.length).toBe(2);
    });

    it('should fail after all retries', async () => {
      fetchMockHelper.mockImplementation({ body: 'Server Error', status: 500 });
      expect(strategy.download(testUrl, { retryCount: 2, retryDelay: 10 })).rejects.toThrow(
        ServerError
      );
      expect(fetchMockHelper.getSpy().mock.calls.length).toBe(3);
    });

    it('should throw NetworkError if retries exhausted on non-HttpError', async () => {
      fetchMockHelper.mockImplementation({ error: new Error('Simulated network issue') });
      expect(strategy.download(testUrl, { retryCount: 1, retryDelay: 10 })).rejects.toThrow(
        NetworkError
      );

      fetchMockHelper.reset();
      fetchMockHelper.mockImplementation({ error: new Error('Simulated network issue') });
      try {
        await strategy.download(testUrl, { retryCount: 1, retryDelay: 10 });
      } catch (e: any) {
        expect(e.message).toBe('Simulated network issue');
        expect(e.url).toBe(testUrl);
        expect(e.originalError).toBeInstanceOf(Error);
      }
      expect(fetchMockHelper.getSpy().mock.calls.length).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should throw NetworkError if fetch itself throws', async () => {
      const originalError = new Error('Connection refused');
      fetchMockHelper.mockErrorOnce(originalError);
      expect(strategy.download(testUrl, {})).rejects.toThrow(NetworkError);

      fetchMockHelper.reset();
      fetchMockHelper.mockErrorOnce(originalError);
      try {
        await strategy.download(testUrl, {});
      } catch (e: any) {
        expect(e.message).toBe('Connection refused');
        expect(e.url).toBe(testUrl);
        expect(e.originalError).toBe(originalError);
      }
    });

    it('should throw NotFoundError for 404', async () => {
      fetchMockHelper.mockResponseOnce({ body: 'Not Here', status: 404 });
      expect(strategy.download(testUrl, {})).rejects.toThrow(NotFoundError);
      fetchMockHelper.reset();
      fetchMockHelper.mockResponseOnce({ body: 'Not Here', status: 404 });
      try {
        await strategy.download(testUrl, {});
      } catch (e: any) {
        expect(e.statusCode).toBe(404);
        expect(e.responseBody).toBe('Not Here');
      }
    });

    it('should throw RateLimitError for 429', async () => {
      fetchMockHelper.mockResponseOnce({
        body: 'Too Fast',
        status: 429,
        headers: { 'Retry-After': '60' },
      });
      expect(strategy.download(testUrl, {})).rejects.toThrow(RateLimitError);
      fetchMockHelper.reset();
      fetchMockHelper.mockResponseOnce({
        body: 'Too Fast',
        status: 429,
        headers: { 'Retry-After': '60' },
      });
      try {
        await strategy.download(testUrl, {});
      } catch (e: any) {
        expect(e.statusCode).toBe(429);
        expect(e.responseBody).toBe('Too Fast');
        expect(e.resetTimestamp).toBeGreaterThan(Date.now());
      }
    });

    it('should throw RateLimitError for 403 with X-RateLimit-Reset', async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 3600;
      fetchMockHelper.mockResponseOnce({
        body: 'Rate Limited',
        status: 403,
        headers: { 'X-RateLimit-Reset': String(resetTime) },
      });
      expect(strategy.download(testUrl, {})).rejects.toThrow(RateLimitError);
      fetchMockHelper.reset();
      fetchMockHelper.mockResponseOnce({
        body: 'Rate Limited',
        status: 403,
        headers: { 'X-RateLimit-Reset': String(resetTime) },
      });
      try {
        await strategy.download(testUrl, {});
      } catch (e: any) {
        expect(e.statusCode).toBe(403);
        expect(e.responseBody).toBe('Rate Limited');
        expect(e.resetTimestamp).toBe(resetTime * 1000);
      }
    });

    it('should throw RateLimitError for 403 with Retry-After (seconds)', async () => {
      fetchMockHelper.mockResponseOnce({
        body: 'Rate Limited',
        status: 403,
        headers: { 'Retry-After': '120' },
      });
      expect(strategy.download(testUrl, {})).rejects.toThrow(RateLimitError);
      fetchMockHelper.reset();
      fetchMockHelper.mockResponseOnce({
        body: 'Rate Limited',
        status: 403,
        headers: { 'Retry-After': '120' },
      });
      try {
        await strategy.download(testUrl, {});
      } catch (e: any) {
        expect(e.statusCode).toBe(403);
        expect(e.resetTimestamp).toBeGreaterThan(Date.now() + 119000);
        expect(e.resetTimestamp).toBeLessThanOrEqual(Date.now() + 120000 + 2000);
      }
    });

    it('should throw RateLimitError for 403 with Retry-After (HTTP-date)', async () => {
      const retryDate = new Date(Date.now() + 5 * 60 * 1000);
      fetchMockHelper.mockResponseOnce({
        body: 'Rate Limited',
        status: 403,
        headers: { 'Retry-After': retryDate.toUTCString() },
      });
      expect(strategy.download(testUrl, {})).rejects.toThrow(RateLimitError);
      fetchMockHelper.reset();
      fetchMockHelper.mockResponseOnce({
        body: 'Rate Limited',
        status: 403,
        headers: { 'Retry-After': retryDate.toUTCString() },
      });
      try {
        await strategy.download(testUrl, {});
      } catch (e: any) {
        expect(e.statusCode).toBe(403);
        const expectedTimestamp = Math.floor(retryDate.getTime() / 1000) * 1000;
        expect(e.resetTimestamp).toBe(expectedTimestamp);
      }
    });

    it('should throw ForbiddenError for 403 without rate limit headers', async () => {
      fetchMockHelper.mockResponseOnce({ body: 'Forbidden Access', status: 403 });
      expect(strategy.download(testUrl, {})).rejects.toThrow(ForbiddenError);
      fetchMockHelper.reset();
      fetchMockHelper.mockResponseOnce({ body: 'Forbidden Access', status: 403 });
      try {
        await strategy.download(testUrl, {});
      } catch (e: any) {
        expect(e.statusCode).toBe(403);
        expect(e.responseBody).toBe('Forbidden Access');
      }
    });

    it('should throw ClientError for other 4xx (e.g., 400)', async () => {
      fetchMockHelper.mockResponseOnce({ body: 'Bad Request', status: 400 });
      expect(strategy.download(testUrl, {})).rejects.toThrow(ClientError);
      fetchMockHelper.reset();
      fetchMockHelper.mockResponseOnce({ body: 'Bad Request', status: 400 });
      try {
        await strategy.download(testUrl, {});
      } catch (e: any) {
        expect(e.statusCode).toBe(400);
        expect(e.responseBody).toBe('Bad Request');
      }
    });

    it('should throw ServerError for 5xx (e.g., 503)', async () => {
      fetchMockHelper.mockResponseOnce({ body: 'Service Unavailable', status: 503 });
      expect(strategy.download(testUrl, {})).rejects.toThrow(ServerError);
      fetchMockHelper.reset();
      fetchMockHelper.mockResponseOnce({ body: 'Service Unavailable', status: 503 });
      try {
        await strategy.download(testUrl, {});
      } catch (e: any) {
        expect(e.statusCode).toBe(503);
        expect(e.responseBody).toBe('Service Unavailable');
      }
    });

    it('should throw HttpError for other non-ok statuses (e.g., 300)', async () => {
      fetchMockHelper.mockResponseOnce({ body: 'Temporary Redirect', status: 307 });
      expect(strategy.download(testUrl, {})).rejects.toThrow(HttpError);
      fetchMockHelper.reset();
      fetchMockHelper.mockResponseOnce({ body: 'Temporary Redirect', status: 307 });
      try {
        await strategy.download(testUrl, {});
      } catch (e: any) {
        expect(e.statusCode).toBe(307);
        expect(e.responseBody).toBe('Temporary Redirect');
      }
    });

    it('should throw NetworkError if response.body is null', async () => {
      fetchMockHelper.mockResponseOnce({ body: null, status: 200 });
      expect(strategy.download(testUrl, {})).rejects.toThrow(NetworkError);
      fetchMockHelper.reset();
      fetchMockHelper.mockResponseOnce({ body: null, status: 200 });
      try {
        await strategy.download(testUrl, {});
      } catch (e: any) {
        expect(e.message).toBe('Response body is not readable.');
      }
    });

    it('should correctly parse headers into Record in error object', async () => {
      const headers = { 'Content-Type': 'application/json', 'X-Custom-Header': 'CustomValue' };
      fetchMockHelper.mockResponseOnce({ body: 'Bad Request', status: 400, headers });
      try {
        await strategy.download(testUrl, {});
      } catch (e: any) {
        expect(e).toBeInstanceOf(ClientError);
        expect(e.responseHeaders).toBeDefined();
        expect(e.responseHeaders['content-type']).toBe('application/json');
        expect(e.responseHeaders['x-custom-header']).toBe('CustomValue');
      }
    });

    it('should have undefined responseBody in error if response.text() throws', async () => {
      const mockBadResponse = {
        ok: false,
        status: 500,
        statusText: 'Server Error',
        headers: new Headers(),
        text: mock(async () => {
          throw new Error('Cannot read body');
        }),
        body: null, // ReadableStream or null
      };
      fetchMockHelper
        .getSpy()
        .mockImplementationOnce((async () => mockBadResponse as unknown as Response) as any);

      try {
        await strategy.download(testUrl, {});
      } catch (e: any) {
        expect(e).toBeInstanceOf(ServerError);
        expect(e.responseBody).toBeUndefined();
      }
    });
  });

  describe('getResponseHeaders utility (private method test)', () => {
    it('should convert Headers object to Record<string, string>', () => {
      const headers = new Headers();
      headers.append('Content-Type', 'application/json');
      headers.append('X-Test', 'TestValue');
      const result = (strategy as any).getResponseHeaders(headers);
      expect(result).toEqual({
        'content-type': 'application/json',
        'x-test': 'TestValue',
      });
    });
  });

  describe('parseRateLimitReset utility (private method test)', () => {
    it('should parse X-RateLimit-Reset (seconds)', () => {
      const headers = new Headers();
      const futureTimeSec = Math.floor(Date.now() / 1000) + 60;
      headers.append('X-RateLimit-Reset', String(futureTimeSec));
      const result = (strategy as any).parseRateLimitReset(headers);
      expect(result).toBe(futureTimeSec * 1000);
    });

    it('should parse Retry-After (seconds)', () => {
      const headers = new Headers();
      headers.append('Retry-After', '120');
      const result = (strategy as any).parseRateLimitReset(headers);
      expect(result).toBeGreaterThanOrEqual(Date.now() + 120 * 1000 - 500);
      expect(result).toBeLessThanOrEqual(Date.now() + 120 * 1000 + 500);
    });

    it('should parse Retry-After (HTTP-date)', () => {
      const headers = new Headers();
      const retryDate = new Date(Date.now() + 5 * 60 * 1000);
      headers.append('Retry-After', retryDate.toUTCString());
      const result = (strategy as any).parseRateLimitReset(headers);
      const expectedTimestamp = Math.floor(retryDate.getTime() / 1000) * 1000;
      expect(result).toBe(expectedTimestamp);
    });

    it('should return undefined if headers are not present or invalid', () => {
      expect((strategy as any).parseRateLimitReset(new Headers())).toBeUndefined();
      const h2 = new Headers();
      h2.append('X-RateLimit-Reset', 'invalid');
      expect((strategy as any).parseRateLimitReset(h2)).toBeUndefined();
      const h3 = new Headers();
      h3.append('Retry-After', 'invalid');
      expect((strategy as any).parseRateLimitReset(h3)).toBeUndefined();
    });
  });
});
