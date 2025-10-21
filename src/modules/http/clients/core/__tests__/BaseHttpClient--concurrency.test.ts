import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { HttpCache } from '@modules/http/cache/HttpCache';
import { FetchTransport } from '@modules/http/transports/FetchTransport';
import { FetchMockHelper, TestLogger } from '@testing-helpers';
import { z } from 'zod';
import { BaseHttpClient } from '../BaseHttpClient';

describe('BaseHttpClient - Concurrency', () => {
  const fetchMock = new FetchMockHelper();
  let logger: TestLogger;
  let transport: FetchTransport;
  let cache: HttpCache;
  let client: BaseHttpClient;

  beforeAll(() => {
    fetchMock.setup();
  });

  beforeEach(() => {
    fetchMock.reset();
    logger = new TestLogger();
    transport = new FetchTransport();
    cache = new HttpCache();
    client = new BaseHttpClient({
      transport,
      logger,
      cache,
      cacheEnabled: true,
    });
  });

  afterAll(() => {
    fetchMock.restore();
  });

  const schema = z.object({ value: z.number(), id: z.string() });

  test('handles multiple concurrent requests to different URLs', async () => {
    fetchMock.mockJsonResponseOnce({ value: 1, id: 'request-1' });
    fetchMock.mockJsonResponseOnce({ value: 2, id: 'request-2' });
    fetchMock.mockJsonResponseOnce({ value: 3, id: 'request-3' });

    const requests = [
      client.request({ method: 'GET', url: 'https://api.example.com/data1', responseFormat: 'json', schema }),
      client.request({ method: 'GET', url: 'https://api.example.com/data2', responseFormat: 'json', schema }),
      client.request({ method: 'GET', url: 'https://api.example.com/data3', responseFormat: 'json', schema }),
    ];

    const responses = await Promise.all(requests);
    expect(responses).toHaveLength(3);
    const [r0, r1, r2] = responses;
    expect(r0?.body.value).toBe(1);
    expect(r1?.body.value).toBe(2);
    expect(r2?.body.value).toBe(3);
    expect(fetchMock.getSpy()).toHaveBeenCalledTimes(3);
  });

  test('handles multiple concurrent requests to same URL with caching', async () => {
    // Mock enough responses for potential race conditions
    fetchMock.mockJsonResponseOnce({ value: 42, id: 'shared' });
    fetchMock.mockJsonResponseOnce({ value: 42, id: 'shared' });
    fetchMock.mockJsonResponseOnce({ value: 42, id: 'shared' });

    const cachePolicy = { namespace: 'default' as const };
    const requests = [
      client.request({
        method: 'GET',
        url: 'https://api.example.com/data',
        responseFormat: 'json',
        schema,
        cachePolicy,
      }),
      client.request({
        method: 'GET',
        url: 'https://api.example.com/data',
        responseFormat: 'json',
        schema,
        cachePolicy,
      }),
      client.request({
        method: 'GET',
        url: 'https://api.example.com/data',
        responseFormat: 'json',
        schema,
        cachePolicy,
      }),
    ];

    const responses = await Promise.all(requests);
    expect(responses).toHaveLength(3);

    for (const response of responses) {
      expect(response?.body.value).toBe(42);
    }

    const callCount = fetchMock.getSpy().mock.calls.length;
    expect(callCount).toBeGreaterThanOrEqual(1);
    expect(callCount).toBeLessThanOrEqual(3);
  });

  test('handles concurrent requests where some succeed and some fail', async () => {
    fetchMock.mockJsonResponseOnce({ value: 1, id: 'success' });
    fetchMock.mockResponseOnce({ status: 404, statusText: 'Not Found' });
    fetchMock.mockJsonResponseOnce({ value: 3, id: 'success-2' });

    const requests = [
      client.request({ method: 'GET', url: 'https://api.example.com/success', responseFormat: 'json', schema }),
      client.request({ method: 'GET', url: 'https://api.example.com/fail', responseFormat: 'json', schema }),
      client.request({ method: 'GET', url: 'https://api.example.com/success2', responseFormat: 'json', schema }),
    ];

    const results = await Promise.allSettled(requests);
    expect(results).toHaveLength(3);
    expect(results[0]?.status).toBe('fulfilled');
    expect(results[1]?.status).toBe('rejected');
    expect(results[2]?.status).toBe('fulfilled');
  });

  test('cache works correctly with sequential requests', async () => {
    fetchMock.mockJsonResponseOnce({ value: 42, id: 'first-response' });
    fetchMock.mockJsonResponseOnce({ value: 99, id: 'second-response' });

    const cachePolicy = { namespace: 'default' as const };

    const firstResponse = await client.request({
      method: 'GET',
      url: 'https://api.example.com/cached',
      responseFormat: 'json',
      schema,
      cachePolicy,
    });

    const secondResponse = await client.request({
      method: 'GET',
      url: 'https://api.example.com/cached',
      responseFormat: 'json',
      schema,
      cachePolicy,
    });

    expect(firstResponse.body.value).toBe(42);
    expect(secondResponse.body.value).toBe(42);
    expect(fetchMock.getSpy().mock.calls.length).toBe(1);
  });
});
