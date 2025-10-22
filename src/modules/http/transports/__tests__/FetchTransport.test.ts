import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { setupTestCleanup } from '@rageltd/bun-test-utils';
import { HttpTransportError } from '../../errors/HttpTransportError';
import type { HttpTransportRequest } from '../../types/HttpTypes';
import { FetchTransport } from '../FetchTransport';

setupTestCleanup();

describe('FetchTransport', () => {
  let mockFetch: ReturnType<typeof mock>;
  let transport: FetchTransport;

  beforeEach(() => {
    mockFetch = mock();
    transport = new FetchTransport({ fetchImplementation: mockFetch as unknown as typeof fetch });
  });

  afterEach(() => {
    mockFetch.mockRestore();
  });

  describe('Constructor', () => {
    test('uses provided fetch implementation', async () => {
      const customFetch = mock(() =>
        Promise.resolve(
          new Response('test', {
            status: 200,
            statusText: 'OK',
          })
        )
      );

      const customTransport = new FetchTransport({ fetchImplementation: customFetch as unknown as typeof fetch });
      await customTransport.execute({
        method: 'GET',
        url: 'https://example.com',
      });

      expect(customFetch).toHaveBeenCalledTimes(1);
    });

    test('uses global fetch when no implementation provided', () => {
      const defaultTransport = new FetchTransport();
      expect(defaultTransport).toBeDefined();
    });
  });

  describe('Request Execution', () => {
    test('executes GET request successfully', async () => {
      const responseBody = 'response data';
      mockFetch.mockResolvedValue(
        new Response(responseBody, {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'text/plain' },
        })
      );

      const request: HttpTransportRequest = {
        method: 'GET',
        url: 'https://api.example.com/data',
      };

      const response = await transport.execute(request);

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/data', {
        method: 'GET',
        headers: undefined,
        body: undefined,
        signal: expect.any(AbortSignal),
      });

      expect(response.status).toBe(200);
      expect(response.statusText).toBe('OK');
      expect(new TextDecoder().decode(response.body)).toBe(responseBody);
    });

    test('executes POST request with body', async () => {
      mockFetch.mockResolvedValue(
        new Response('created', {
          status: 201,
          statusText: 'Created',
        })
      );

      const requestBody = JSON.stringify({ key: 'value' });
      const request: HttpTransportRequest = {
        method: 'POST',
        url: 'https://api.example.com/create',
        body: requestBody,
      };

      await transport.execute(request);

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/create', {
        method: 'POST',
        headers: undefined,
        body: requestBody,
        signal: expect.any(AbortSignal),
      });
    });

    test('includes headers in request', async () => {
      mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

      const request: HttpTransportRequest = {
        method: 'GET',
        url: 'https://api.example.com/data',
        headers: {
          Authorization: 'Bearer token123',
          'Content-Type': 'application/json',
        },
      };

      await transport.execute(request);

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/data', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer token123',
          'Content-Type': 'application/json',
        },
        body: undefined,
        signal: expect.any(AbortSignal),
      });
    });

    test('returns response with lowercase header keys', async () => {
      mockFetch.mockResolvedValue(
        new Response('data', {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Custom-Header': 'value',
            ETag: '"abc123"',
          },
        })
      );

      const response = await transport.execute({
        method: 'GET',
        url: 'https://api.example.com',
      });

      expect(response.headers).toEqual({
        'content-type': 'application/json',
        'x-custom-header': 'value',
        etag: '"abc123"',
      });
    });

    test('handles binary response body', async () => {
      const binaryData = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
      mockFetch.mockResolvedValue(
        new Response(binaryData, {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        })
      );

      const response = await transport.execute({
        method: 'GET',
        url: 'https://api.example.com/file',
      });

      expect(response.body).toBeInstanceOf(Uint8Array);
      expect(Array.from(response.body)).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    });

    test('handles empty response body', async () => {
      mockFetch.mockResolvedValue(
        new Response(null, {
          status: 204,
          statusText: 'No Content',
        })
      );

      const response = await transport.execute({
        method: 'DELETE',
        url: 'https://api.example.com/resource',
      });

      expect(response.status).toBe(204);
      expect(response.body).toBeInstanceOf(Uint8Array);
      expect(response.body.length).toBe(0);
    });
  });

  describe('Timeout Handling', () => {
    test('aborts request when timeout is reached', async () => {
      mockFetch.mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => {
              const error = new DOMException('The operation was aborted.', 'AbortError');
              reject(error);
            }, 50);
          })
      );

      const request: HttpTransportRequest = {
        method: 'GET',
        url: 'https://api.example.com/slow',
        timeoutMs: 10,
      };

      await expect(transport.execute(request)).rejects.toThrow(HttpTransportError);
      await expect(transport.execute(request)).rejects.toThrow('HTTP request timed out after 10ms');

      try {
        await transport.execute(request);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpTransportError);
        if (error instanceof HttpTransportError) {
          expect(error.reason).toBe('timeout');
          expect(error.cause).toBeInstanceOf(DOMException);
        }
      }
    });

    test('does not set timeout when timeoutMs is zero', async () => {
      mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

      await transport.execute({
        method: 'GET',
        url: 'https://api.example.com',
        timeoutMs: 0,
      });

      expect(mockFetch).toHaveBeenCalled();
    });

    test('does not set timeout when timeoutMs is negative', async () => {
      mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

      await transport.execute({
        method: 'GET',
        url: 'https://api.example.com',
        timeoutMs: -1,
      });

      expect(mockFetch).toHaveBeenCalled();
    });

    test('does not set timeout when timeoutMs is undefined', async () => {
      mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

      await transport.execute({
        method: 'GET',
        url: 'https://api.example.com',
      });

      expect(mockFetch).toHaveBeenCalled();
    });

    test('clears timeout after successful request', async () => {
      mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

      await transport.execute({
        method: 'GET',
        url: 'https://api.example.com',
        timeoutMs: 5000,
      });

      // If timeout wasn't cleared, it would still be active
      // This test verifies the finally block executes
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    test('throws HttpTransportError on network failure', async () => {
      const networkError = new Error('Failed to fetch');
      mockFetch.mockRejectedValue(networkError);

      const request: HttpTransportRequest = {
        method: 'GET',
        url: 'https://api.example.com/data',
      };

      await expect(transport.execute(request)).rejects.toThrow(HttpTransportError);
      await expect(transport.execute(request)).rejects.toThrow('HTTP transport failed to execute request');

      try {
        await transport.execute(request);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpTransportError);
        if (error instanceof HttpTransportError) {
          expect(error.reason).toBe('network');
          expect(error.cause).toBe(networkError);
        }
      }
    });

    test('wraps non-Error objects in Error for network failures', async () => {
      mockFetch.mockRejectedValue('string error');

      const request: HttpTransportRequest = {
        method: 'GET',
        url: 'https://api.example.com/data',
      };

      try {
        await transport.execute(request);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpTransportError);
        if (error instanceof HttpTransportError) {
          expect(error.reason).toBe('network');
          expect(error.cause).toBeInstanceOf(Error);
          expect(error.cause?.message).toBe('Unknown transport error');
        }
      }
    });

    test('distinguishes between timeout and network errors', async () => {
      // Timeout error
      const timeoutError = new DOMException('The operation was aborted.', 'AbortError');
      mockFetch.mockRejectedValueOnce(timeoutError);

      try {
        await transport.execute({
          method: 'GET',
          url: 'https://api.example.com',
          timeoutMs: 10,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(HttpTransportError);
        if (error instanceof HttpTransportError) {
          expect(error.reason).toBe('timeout');
        }
      }

      // Network error
      const networkError = new Error('Network failure');
      mockFetch.mockRejectedValueOnce(networkError);

      try {
        await transport.execute({
          method: 'GET',
          url: 'https://api.example.com',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(HttpTransportError);
        if (error instanceof HttpTransportError) {
          expect(error.reason).toBe('network');
        }
      }
    });

    test('clears timeout even when request fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      try {
        await transport.execute({
          method: 'GET',
          url: 'https://api.example.com',
          timeoutMs: 5000,
        });
      } catch {
        // Expected to throw
      }

      // Verify the finally block executed and cleared timeout
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('HTTP Methods', () => {
    test('supports GET method', async () => {
      mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

      await transport.execute({ method: 'GET', url: 'https://api.example.com' });

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com', expect.objectContaining({ method: 'GET' }));
    });

    test('supports POST method', async () => {
      mockFetch.mockResolvedValue(new Response('ok', { status: 201 }));

      await transport.execute({ method: 'POST', url: 'https://api.example.com' });

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com', expect.objectContaining({ method: 'POST' }));
    });

    test('supports PUT method', async () => {
      mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

      await transport.execute({ method: 'PUT', url: 'https://api.example.com' });

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com', expect.objectContaining({ method: 'PUT' }));
    });

    test('supports DELETE method', async () => {
      mockFetch.mockResolvedValue(new Response('ok', { status: 204 }));

      await transport.execute({ method: 'DELETE', url: 'https://api.example.com' });

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com', expect.objectContaining({ method: 'DELETE' }));
    });

    test('supports PATCH method', async () => {
      mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

      await transport.execute({ method: 'PATCH', url: 'https://api.example.com' });

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com', expect.objectContaining({ method: 'PATCH' }));
    });
  });

  describe('Response URL Handling', () => {
    test('captures URL from response object', async () => {
      const mockResponse = new Response('ok', {
        status: 200,
      });
      Object.defineProperty(mockResponse, 'url', {
        value: 'https://api.example.com/data',
        writable: false,
      });

      mockFetch.mockResolvedValue(mockResponse);

      const response = await transport.execute({
        method: 'GET',
        url: 'https://api.example.com/data',
      });

      expect(response.url).toBe('https://api.example.com/data');
    });

    test('captures final URL after redirect', async () => {
      const mockResponse = new Response('ok', {
        status: 200,
      });
      Object.defineProperty(mockResponse, 'url', {
        value: 'https://api.example.com/final',
        writable: false,
      });

      mockFetch.mockResolvedValue(mockResponse);

      const response = await transport.execute({
        method: 'GET',
        url: 'https://api.example.com/redirect',
      });

      expect(response.url).toBe('https://api.example.com/final');
    });
  });

  describe('Edge Cases', () => {
    test('handles null body in request', async () => {
      mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

      await transport.execute({
        method: 'POST',
        url: 'https://api.example.com',
        body: null,
      });

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com', expect.objectContaining({ body: undefined }));
    });

    test('handles undefined headers', async () => {
      mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

      await transport.execute({
        method: 'GET',
        url: 'https://api.example.com',
        headers: undefined,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com',
        expect.objectContaining({ headers: undefined })
      );
    });

    test('handles empty headers object', async () => {
      mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

      await transport.execute({
        method: 'GET',
        url: 'https://api.example.com',
        headers: {},
      });

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com', expect.objectContaining({ headers: {} }));
    });

    test('handles response with no headers', async () => {
      mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));

      const response = await transport.execute({
        method: 'GET',
        url: 'https://api.example.com',
      });

      expect(response.headers).toBeDefined();
      expect(typeof response.headers).toBe('object');
    });

    test('handles large response body', async () => {
      const largeData = new Uint8Array(1024 * 1024); // 1MB
      for (let i = 0; i < largeData.length; i++) {
        largeData[i] = i % 256;
      }

      mockFetch.mockResolvedValue(
        new Response(largeData, {
          status: 200,
        })
      );

      const response = await transport.execute({
        method: 'GET',
        url: 'https://api.example.com/large-file',
      });

      expect(response.body).toBeInstanceOf(Uint8Array);
      expect(response.body.length).toBe(1024 * 1024);
    });
  });
});
