import { HttpTransportError } from '../errors/HttpTransportError';
import type { HttpTransportRequest, HttpTransportResponse } from '../types/HttpTypes';
import type { HttpTransport } from '../types/HttpTransport';

export interface FetchTransportOptions {
  readonly fetchImplementation?: typeof fetch;
}

function toHeadersInit(headers?: HttpTransportRequest['headers']): HeadersInit | undefined {
  if (!headers) {
    return undefined;
  }

  const normalizedEntries = Object.entries(headers).map(([key, value]) => [key, value]);
  return Object.fromEntries(normalizedEntries);
}

function toResponseHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

export class FetchTransport implements HttpTransport {
  private readonly fetch: typeof fetch;

  constructor(options: FetchTransportOptions = {}) {
    this.fetch = options.fetchImplementation ?? fetch;
  }

  async execute(request: HttpTransportRequest): Promise<HttpTransportResponse> {
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    if (typeof request.timeoutMs === 'number' && request.timeoutMs > 0) {
      timeoutHandle = setTimeout(() => controller.abort(), request.timeoutMs);
    }

    try {
      const response = await this.fetch(request.url, {
        method: request.method,
        headers: toHeadersInit(request.headers),
        body: request.body ?? undefined,
        signal: controller.signal,
      });

      const bodyBuffer = await response.arrayBuffer();

      return {
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        headers: toResponseHeaders(response.headers),
        body: new Uint8Array(bodyBuffer),
      } satisfies HttpTransportResponse;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new HttpTransportError(`HTTP request timed out after ${request.timeoutMs ?? 0}ms`, {
          reason: 'timeout',
          cause: error,
        });
      }

      throw new HttpTransportError('HTTP transport failed to execute request', {
        reason: 'network',
        cause: error instanceof Error ? error : new Error('Unknown transport error'),
      });
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}
