/**
 * @file generator/src/modules/downloader/__tests__/NodeFetchStrategy.test.ts
 * @description Tests for the NodeFetchStrategy class.
 */

import {
  describe,
  it,
  expect,
  mock,
  beforeEach,
  afterEach,
  spyOn,
  afterAll,
  beforeAll,
} from 'bun:test';
import { NodeFetchStrategy } from '../NodeFetchStrategy';
import type { DownloadProgress } from '../IDownloader';
import {
  NetworkError,
  HttpError,
  NotFoundError,
  ForbiddenError,
  RateLimitError,
  ClientError,
  ServerError,
} from '../errors';
import { createLogger } from '../../logger';
import type { IFileSystem } from '../../file-system/IFileSystem';

createLogger('NodeFetchStrategy.test');

describe('NodeFetchStrategy', () => {
  let mockFileSystem: IFileSystem;
  let strategy: NodeFetchStrategy;
  let spyFetch: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>;

  const testUrl = 'http://example.com/testfile.txt';
  const mockFileData = 'This is mock file data.';
  const mockFileBuffer = Buffer.from(mockFileData);

  beforeAll(() => {
    spyFetch = spyOn(globalThis, 'fetch');
  });

  beforeEach(() => {
    mockFileSystem = {
      writeFile: mock(async () => {}),
      readFile: mock(async () => 'mock file content'),
      exists: mock(async () => true),
      mkdir: mock(async () => {}),
      readdir: mock(async () => ['file1.txt']),
      rm: mock(async () => {}),
      rmdir: mock(async () => {}),
      stat: mock(async () => ({ isFile: () => true, isDirectory: () => false, size: 100 }) as any),
      symlink: mock(async () => {}),
      readlink: mock(async () => 'mock-link-target'),
      chmod: mock(async () => {}),
      copyFile: mock(async () => {}),
      rename: mock(async () => {}),
      ensureDir: mock(async () => {}),
    };
    strategy = new NodeFetchStrategy(mockFileSystem);
    spyFetch.mockReset();
    if ((mockFileSystem.writeFile as any).mockClear) {
      (mockFileSystem.writeFile as any).mockClear();
    }
  });

  afterEach(() => {
    // mockReset in beforeEach should be enough
  });

  afterAll(() => {
    spyFetch.mockRestore();
  });

  it('isAvailable() should return true', async () => {
    expect(await strategy.isAvailable()).toBe(true);
  });

  describe('download to Buffer', () => {
    it('should download data to a Buffer successfully', async () => {
      spyFetch.mockImplementationOnce((async (
        input: URL | RequestInfo,
        _init?: RequestInit | undefined
      ) => {
        if (input.toString() === testUrl) {
          return new Response(mockFileData, {
            status: 200,
            headers: { 'Content-Length': String(mockFileBuffer.length) },
          });
        }
        return new Response('Unexpected call to fetch mock', { status: 500 });
      }) as any);

      const result = await strategy.download(testUrl, {});
      expect(result).toBeInstanceOf(Buffer);
      expect(result!.toString()).toBe(mockFileData);
      expect(spyFetch.mock.calls.length).toBe(1);
      if (spyFetch.mock.calls[0]) {
        expect(spyFetch.mock.calls[0][0]).toBe(testUrl);
      } else {
        expect(spyFetch.mock.calls.length).toBeGreaterThan(0);
      }
    });

    it('should handle response without content-length for buffer download', async () => {
      spyFetch.mockImplementationOnce((async (
        input: URL | RequestInfo,
        _init?: RequestInit | undefined
      ) => {
        if (input.toString() === testUrl) {
          return new Response(mockFileData, {
            status: 200,
          });
        }
        return new Response('Unexpected call to fetch mock', { status: 500 });
      }) as any);
      const result = await strategy.download(testUrl, {});
      expect(result!.toString()).toBe(mockFileData);
      expect(spyFetch.mock.calls.length).toBe(1);
      if (spyFetch.mock.calls[0]) {
        expect(spyFetch.mock.calls[0][0]).toBe(testUrl);
      } else {
        expect(spyFetch.mock.calls.length).toBeGreaterThan(0);
      }
    });
  });

  describe('download to File', () => {
    it('should download data to a file successfully using IFileSystem', async () => {
      const destinationPath = '/tmp/testdownload.txt';
      spyFetch.mockImplementationOnce((async (
        input: URL | RequestInfo,
        _init?: RequestInit | undefined
      ) => {
        if (input.toString() === testUrl) {
          return new Response(mockFileData, {
            status: 200,
            headers: { 'Content-Length': String(mockFileBuffer.length) },
          });
        }
        return new Response('Unexpected call to fetch mock', { status: 500 });
      }) as any);

      const result = await strategy.download(testUrl, { destinationPath });

      expect(result).toBeUndefined();
      expect(spyFetch.mock.calls.length).toBe(1);
      if (spyFetch.mock.calls[0]) {
        expect(spyFetch.mock.calls[0][0]).toBe(testUrl);
      } else {
        expect(spyFetch.mock.calls.length).toBeGreaterThan(0);
      }
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(destinationPath, mockFileBuffer);
    });
  });

  describe('onProgress callback', () => {
    it('should call onProgress with correct data', async () => {
      const onProgressMock = mock((_progress: DownloadProgress) => {});
      spyFetch.mockImplementationOnce((async (
        input: URL | RequestInfo,
        _init?: RequestInit | undefined
      ) => {
        if (input.toString() === testUrl) {
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(mockFileData.substring(0, 10)));
              controller.enqueue(new TextEncoder().encode(mockFileData.substring(10)));
              controller.close();
            },
          });
          return new Response(stream, {
            status: 200,
            headers: { 'Content-Length': String(mockFileBuffer.length) },
          });
        }
        return new Response('Unexpected call to fetch mock', { status: 500 });
      }) as any);

      await strategy.download(testUrl, { onProgress: onProgressMock });

      expect(onProgressMock).toHaveBeenCalled();
      if (onProgressMock.mock.calls && onProgressMock.mock.calls.length > 0) {
        expect(onProgressMock.mock.calls?.[0]?.[0]).toEqual({
          bytesDownloaded: 0,
          totalBytes: mockFileBuffer.length,
          percentage: 0,
        });
        const lastCallArgs = onProgressMock.mock.calls?.[onProgressMock.mock.calls.length - 1]?.[0];
        if (lastCallArgs) {
          expect(lastCallArgs.bytesDownloaded).toBe(mockFileBuffer.length);
          expect(lastCallArgs.totalBytes).toBe(mockFileBuffer.length);
          expect(lastCallArgs.percentage).toBe(100);
        } else {
          expect(lastCallArgs).toBeDefined();
        }
      } else {
        expect(onProgressMock.mock.calls.length).toBeGreaterThan(0);
      }
    });

    it('should call onProgress without percentage if Content-Length is missing', async () => {
      const onProgressMock = mock((_progress: DownloadProgress) => {});
      spyFetch.mockImplementationOnce((async (
        input: URL | RequestInfo,
        _init?: RequestInit | undefined
      ) => {
        if (input.toString() === testUrl) {
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(mockFileData.substring(0, 10)));
              controller.enqueue(new TextEncoder().encode(mockFileData.substring(10)));
              controller.close();
            },
          });
          return new Response(stream, {
            status: 200,
          });
        }
        return new Response('Unexpected call to fetch mock', { status: 500 });
      }) as any);

      await strategy.download(testUrl, { onProgress: onProgressMock });

      expect(onProgressMock).toHaveBeenCalled();
      if (onProgressMock.mock.calls && onProgressMock.mock.calls.length > 0) {
        expect(onProgressMock.mock.calls?.[0]?.[0]).toEqual({ bytesDownloaded: 0 });
        const lastCallArgs = onProgressMock.mock.calls?.[onProgressMock.mock.calls.length - 1]?.[0];
        if (lastCallArgs) {
          expect(lastCallArgs.bytesDownloaded).toBe(mockFileBuffer.length);
          expect(lastCallArgs.totalBytes).toBeUndefined();
          expect(lastCallArgs.percentage).toBeUndefined();
        } else {
          expect(lastCallArgs).toBeDefined();
        }
      } else {
        expect(onProgressMock.mock.calls.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Timeout handling', () => {
    it('should throw NetworkError on timeout', async () => {
      spyFetch.mockImplementationOnce((async (
        _input: URL | RequestInfo,
        init?: RequestInit | undefined
      ) => {
        return new Promise((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          const timeoutId = setTimeout(() => {
            // This part should ideally not be reached if abort works correctly
            // but as a fallback, we can resolve, though the test expects rejection.
            // For a timeout test, the abort should cause the rejection.
          }, 200); // Delay longer than the strategy's timeout
          init?.signal?.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }) as any);
      await expect(strategy.download(testUrl, { timeout: 50 })).rejects.toThrow(NetworkError);

      // Test the internal error properties
      spyFetch.mockReset();
      spyFetch.mockImplementationOnce((async (
        _input: URL | RequestInfo,
        init?: RequestInit | undefined
      ) => {
        return new Promise((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          const timeoutId = setTimeout(() => {
            // Fallback, should not be hit
          }, 200);
          init?.signal?.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }) as any);
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
      spyFetch
        .mockImplementationOnce((async () => new Response('Server Error', { status: 500 })) as any)
        .mockImplementationOnce(
          (async () =>
            new Response(mockFileData, {
              status: 200,
              headers: { 'Content-Length': String(mockFileBuffer.length) },
            })) as any
        );

      const result = await strategy.download(testUrl, { retryCount: 1, retryDelay: 10 });
      expect(result!.toString()).toBe(mockFileData);
      expect(spyFetch.mock.calls.length).toBe(2);
    });

    it('should fail after all retries', async () => {
      spyFetch.mockImplementation(
        (async () => new Response('Server Error', { status: 500 })) as any
      );
      await expect(strategy.download(testUrl, { retryCount: 2, retryDelay: 10 })).rejects.toThrow(
        ServerError
      );
      expect(spyFetch.mock.calls.length).toBe(3);
    });

    it('should throw NetworkError if retries exhausted on non-HttpError', async () => {
      spyFetch.mockImplementation((async () => {
        throw new Error('Simulated network issue');
      }) as any);
      await expect(strategy.download(testUrl, { retryCount: 1, retryDelay: 10 })).rejects.toThrow(
        NetworkError
      );

      spyFetch.mockReset();
      spyFetch.mockImplementation((async () => {
        throw new Error('Simulated network issue');
      }) as any);
      try {
        await strategy.download(testUrl, { retryCount: 1, retryDelay: 10 });
      } catch (e: any) {
        expect(e.message).toBe('Simulated network issue');
        expect(e.url).toBe(testUrl);
        expect(e.originalError).toBeInstanceOf(Error);
      }
      expect(spyFetch.mock.calls.length).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should throw NetworkError if fetch itself throws', async () => {
      const originalError = new Error('Connection refused');
      spyFetch.mockImplementationOnce((async () => {
        throw originalError;
      }) as any);
      await expect(strategy.download(testUrl, {})).rejects.toThrow(NetworkError);

      spyFetch.mockReset();
      spyFetch.mockImplementationOnce((async () => {
        throw originalError;
      }) as any);
      try {
        await strategy.download(testUrl, {});
      } catch (e: any) {
        expect(e.message).toBe('Connection refused');
        expect(e.url).toBe(testUrl);
        expect(e.originalError).toBe(originalError);
      }
    });

    it('should throw NotFoundError for 404', async () => {
      spyFetch.mockImplementationOnce(
        (async () => new Response('Not Here', { status: 404 })) as any
      );
      await expect(strategy.download(testUrl, {})).rejects.toThrow(NotFoundError);
      spyFetch.mockReset();
      spyFetch.mockImplementationOnce(
        (async () => new Response('Not Here', { status: 404 })) as any
      );
      try {
        await strategy.download(testUrl, {});
      } catch (e: any) {
        expect(e.statusCode).toBe(404);
        expect(e.responseBody).toBe('Not Here');
      }
    });

    it('should throw RateLimitError for 429', async () => {
      spyFetch.mockImplementationOnce(
        (async () =>
          new Response('Too Fast', { status: 429, headers: { 'Retry-After': '60' } })) as any
      );
      await expect(strategy.download(testUrl, {})).rejects.toThrow(RateLimitError);
      spyFetch.mockReset();
      spyFetch.mockImplementationOnce(
        (async () =>
          new Response('Too Fast', { status: 429, headers: { 'Retry-After': '60' } })) as any
      );
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
      spyFetch.mockImplementationOnce(
        (async () =>
          new Response('Rate Limited', {
            status: 403,
            headers: { 'X-RateLimit-Reset': String(resetTime) },
          })) as any
      );
      await expect(strategy.download(testUrl, {})).rejects.toThrow(RateLimitError);
      spyFetch.mockReset();
      spyFetch.mockImplementationOnce(
        (async () =>
          new Response('Rate Limited', {
            status: 403,
            headers: { 'X-RateLimit-Reset': String(resetTime) },
          })) as any
      );
      try {
        await strategy.download(testUrl, {});
      } catch (e: any) {
        expect(e.statusCode).toBe(403);
        expect(e.responseBody).toBe('Rate Limited');
        expect(e.resetTimestamp).toBe(resetTime * 1000);
      }
    });

    it('should throw RateLimitError for 403 with Retry-After (seconds)', async () => {
      spyFetch.mockImplementationOnce(
        (async () =>
          new Response('Rate Limited', {
            status: 403,
            headers: { 'Retry-After': '120' },
          })) as any
      );
      await expect(strategy.download(testUrl, {})).rejects.toThrow(RateLimitError);
      spyFetch.mockReset();
      spyFetch.mockImplementationOnce(
        (async () =>
          new Response('Rate Limited', {
            status: 403,
            headers: { 'Retry-After': '120' },
          })) as any
      );
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
      spyFetch.mockImplementationOnce(
        (async () =>
          new Response('Rate Limited', {
            status: 403,
            headers: { 'Retry-After': retryDate.toUTCString() },
          })) as any
      );
      await expect(strategy.download(testUrl, {})).rejects.toThrow(RateLimitError);
      spyFetch.mockReset();
      spyFetch.mockImplementationOnce(
        (async () =>
          new Response('Rate Limited', {
            status: 403,
            headers: { 'Retry-After': retryDate.toUTCString() },
          })) as any
      );
      try {
        await strategy.download(testUrl, {});
      } catch (e: any) {
        expect(e.statusCode).toBe(403);
        const expectedTimestamp = Math.floor(retryDate.getTime() / 1000) * 1000;
        expect(e.resetTimestamp).toBe(expectedTimestamp);
      }
    });

    it('should throw ForbiddenError for 403 without rate limit headers', async () => {
      spyFetch.mockImplementationOnce(
        (async () => new Response('Forbidden Access', { status: 403 })) as any
      );
      await expect(strategy.download(testUrl, {})).rejects.toThrow(ForbiddenError);
      spyFetch.mockReset();
      spyFetch.mockImplementationOnce(
        (async () => new Response('Forbidden Access', { status: 403 })) as any
      );
      try {
        await strategy.download(testUrl, {});
      } catch (e: any) {
        expect(e.statusCode).toBe(403);
        expect(e.responseBody).toBe('Forbidden Access');
      }
    });

    it('should throw ClientError for other 4xx (e.g., 400)', async () => {
      spyFetch.mockImplementationOnce(
        (async () => new Response('Bad Request', { status: 400 })) as any
      );
      await expect(strategy.download(testUrl, {})).rejects.toThrow(ClientError);
      spyFetch.mockReset();
      spyFetch.mockImplementationOnce(
        (async () => new Response('Bad Request', { status: 400 })) as any
      );
      try {
        await strategy.download(testUrl, {});
      } catch (e: any) {
        expect(e.statusCode).toBe(400);
        expect(e.responseBody).toBe('Bad Request');
      }
    });

    it('should throw ServerError for 5xx (e.g., 503)', async () => {
      spyFetch.mockImplementationOnce(
        (async () => new Response('Service Unavailable', { status: 503 })) as any
      );
      await expect(strategy.download(testUrl, {})).rejects.toThrow(ServerError);
      spyFetch.mockReset();
      spyFetch.mockImplementationOnce(
        (async () => new Response('Service Unavailable', { status: 503 })) as any
      );
      try {
        await strategy.download(testUrl, {});
      } catch (e: any) {
        expect(e.statusCode).toBe(503);
        expect(e.responseBody).toBe('Service Unavailable');
      }
    });

    it('should throw HttpError for other non-ok statuses (e.g., 300)', async () => {
      spyFetch.mockImplementationOnce(
        (async () => new Response('Temporary Redirect', { status: 307 })) as any
      );
      await expect(strategy.download(testUrl, {})).rejects.toThrow(HttpError);
      spyFetch.mockReset();
      spyFetch.mockImplementationOnce(
        (async () => new Response('Temporary Redirect', { status: 307 })) as any
      );
      try {
        await strategy.download(testUrl, {});
      } catch (e: any) {
        expect(e.statusCode).toBe(307);
        expect(e.responseBody).toBe('Temporary Redirect');
      }
    });

    it('should throw NetworkError if response.body is null', async () => {
      spyFetch.mockImplementationOnce((async () => new Response(null, { status: 200 })) as any);
      await expect(strategy.download(testUrl, {})).rejects.toThrow(NetworkError);
      spyFetch.mockReset();
      spyFetch.mockImplementationOnce((async () => new Response(null, { status: 200 })) as any);
      try {
        await strategy.download(testUrl, {});
      } catch (e: any) {
        expect(e.message).toBe('Response body is not readable.');
      }
    });

    it('should correctly parse headers into Record in error object', async () => {
      const headers = { 'Content-Type': 'application/json', 'X-Custom-Header': 'CustomValue' };
      spyFetch.mockImplementationOnce(
        (async () => new Response('Bad Request', { status: 400, headers })) as any
      );
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
      spyFetch.mockImplementationOnce((async () => mockBadResponse as unknown as Response) as any);

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
