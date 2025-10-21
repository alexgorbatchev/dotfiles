import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { HttpCache, FetchTransport } from '@modules/http';
import { FetchMockHelper, TestLogger } from '@testing-helpers';
import { z } from 'zod';
import { BaseHttpClient } from '../BaseHttpClient';

describe('BaseHttpClient - Cache Key Determinism', () => {
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

  const schema = z.object({ value: z.number() });

  test('generates same cache key for identical requests', async () => {
    fetchMock.mockJsonResponseOnce({ value: 1 });

    await client.request({
      method: 'GET',
      url: 'https://api.example.com/data',
      responseFormat: 'json',
      schema,
      cachePolicy: {
        namespace: 'default',
      },
    });

    fetchMock.mockJsonResponseOnce({ value: 2 });

    const response = await client.request({
      method: 'GET',
      url: 'https://api.example.com/data',
      responseFormat: 'json',
      schema,
      cachePolicy: {
        namespace: 'default',
      },
    });

    // Should return cached value
    expect(response.body.value).toBe(1);
    expect(fetchMock.getSpy()).toHaveBeenCalledTimes(1);
  });

  test('generates different cache keys for different URLs', async () => {
    fetchMock.mockJsonResponseOnce({ value: 1 });

    await client.request({
      method: 'GET',
      url: 'https://api.example.com/data1',
      responseFormat: 'json',
      schema,
      cachePolicy: {
        namespace: 'default',
      },
    });

    fetchMock.mockJsonResponseOnce({ value: 2 });

    const response = await client.request({
      method: 'GET',
      url: 'https://api.example.com/data2',
      responseFormat: 'json',
      schema,
      cachePolicy: {
        namespace: 'default',
      },
    });

    // Should fetch new data
    expect(response.body.value).toBe(2);
    expect(fetchMock.getSpy()).toHaveBeenCalledTimes(2);
  });

  test('generates different cache keys for different namespaces', async () => {
    fetchMock.mockJsonResponseOnce({ value: 1 });

    await client.request({
      method: 'GET',
      url: 'https://api.example.com/data',
      responseFormat: 'json',
      schema,
      cachePolicy: {
        namespace: 'default',
      },
    });

    fetchMock.mockJsonResponseOnce({ value: 2 });

    const response = await client.request({
      method: 'GET',
      url: 'https://api.example.com/data',
      responseFormat: 'json',
      schema,
      cachePolicy: {
        namespace: 'github.releaseMeta',
      },
    });

    // Different namespace should fetch new data
    expect(response.body.value).toBe(2);
    expect(fetchMock.getSpy()).toHaveBeenCalledTimes(2);
  });

  test('generates different cache keys for different methods', async () => {
    fetchMock.mockJsonResponseOnce({ value: 1 });

    await client.request({
      method: 'GET',
      url: 'https://api.example.com/data',
      responseFormat: 'json',
      schema,
      cachePolicy: {
        namespace: 'default',
      },
    });

    fetchMock.mockJsonResponseOnce({ value: 2 });

    const response = await client.request({
      method: 'POST',
      url: 'https://api.example.com/data',
      responseFormat: 'json',
      schema,
      cachePolicy: {
        namespace: 'default',
      },
    });

    // POST should not use cache (and should fetch new data)
    expect(response.body.value).toBe(2);
    expect(fetchMock.getSpy()).toHaveBeenCalledTimes(2);
  });

  describe('auth token variation', () => {
    test('generates different cache keys with different auth tokens for varyByAuth=always', async () => {
      fetchMock.mockJsonResponseOnce({ value: 1 });

      await client.request({
        method: 'GET',
        url: 'https://api.github.com/repos/owner/repo/releases/latest',
        responseFormat: 'json',
        schema,
        authToken: 'token-1',
        cachePolicy: {
          namespace: 'github.releaseMeta', // varyByAuth: always
        },
      });

      fetchMock.mockJsonResponseOnce({ value: 2 });

      const response = await client.request({
        method: 'GET',
        url: 'https://api.github.com/repos/owner/repo/releases/latest',
        responseFormat: 'json',
        schema,
        authToken: 'token-2',
        cachePolicy: {
          namespace: 'github.releaseMeta',
        },
      });

      // Different tokens should fetch new data
      expect(response.body.value).toBe(2);
      expect(fetchMock.getSpy()).toHaveBeenCalledTimes(2);
    });

    test('generates same cache key with same auth token for varyByAuth=always', async () => {
      fetchMock.mockJsonResponseOnce({ value: 1 });

      await client.request({
        method: 'GET',
        url: 'https://api.github.com/repos/owner/repo/releases/latest',
        responseFormat: 'json',
        schema,
        authToken: 'token-1',
        cachePolicy: {
          namespace: 'github.releaseMeta',
        },
      });

      fetchMock.mockJsonResponseOnce({ value: 2 });

      const response = await client.request({
        method: 'GET',
        url: 'https://api.github.com/repos/owner/repo/releases/latest',
        responseFormat: 'json',
        schema,
        authToken: 'token-1',
        cachePolicy: {
          namespace: 'github.releaseMeta',
        },
      });

      // Same token should return cached value
      expect(response.body.value).toBe(1);
      expect(fetchMock.getSpy()).toHaveBeenCalledTimes(1);
    });

    test('ignores auth token for varyByAuth=never', async () => {
      fetchMock.mockJsonResponseOnce({ value: 1 });

      await client.request({
        method: 'GET',
        url: 'https://crates.io/api/v1/crates/serde',
        responseFormat: 'json',
        schema,
        authToken: 'token-1',
        cachePolicy: {
          namespace: 'crates.metadata', // varyByAuth: never
        },
      });

      fetchMock.mockJsonResponseOnce({ value: 2 });

      const response = await client.request({
        method: 'GET',
        url: 'https://crates.io/api/v1/crates/serde',
        responseFormat: 'json',
        schema,
        authToken: 'token-2',
        cachePolicy: {
          namespace: 'crates.metadata',
        },
      });

      // Should return cached value regardless of token
      expect(response.body.value).toBe(1);
      expect(fetchMock.getSpy()).toHaveBeenCalledTimes(1);
    });

    test('varies by auth token only when present for varyByAuth=auto', async () => {
      fetchMock.mockJsonResponseOnce({ value: 1 });

      await client.request({
        method: 'GET',
        url: 'https://api.example.com/data',
        responseFormat: 'json',
        schema,
        cachePolicy: {
          namespace: 'default', // varyByAuth: auto
        },
      });

      fetchMock.mockJsonResponseOnce({ value: 2 });

      const responseWithoutToken = await client.request({
        method: 'GET',
        url: 'https://api.example.com/data',
        responseFormat: 'json',
        schema,
        cachePolicy: {
          namespace: 'default',
        },
      });

      // No token both times, should return cached value
      expect(responseWithoutToken.body.value).toBe(1);
      expect(fetchMock.getSpy()).toHaveBeenCalledTimes(1);
    });

    test('varies by auth token when present for varyByAuth=auto', async () => {
      fetchMock.mockJsonResponseOnce({ value: 1 });

      await client.request({
        method: 'GET',
        url: 'https://api.example.com/data',
        responseFormat: 'json',
        schema,
        authToken: 'token-1',
        cachePolicy: {
          namespace: 'default', // varyByAuth: auto
        },
      });

      fetchMock.mockJsonResponseOnce({ value: 2 });

      const response = await client.request({
        method: 'GET',
        url: 'https://api.example.com/data',
        responseFormat: 'json',
        schema,
        authToken: 'token-2',
        cachePolicy: {
          namespace: 'default',
        },
      });

      // Different tokens should fetch new data
      expect(response.body.value).toBe(2);
      expect(fetchMock.getSpy()).toHaveBeenCalledTimes(2);
    });

    test('different cache keys when one has token and other does not for varyByAuth=auto', async () => {
      fetchMock.mockJsonResponseOnce({ value: 1 });

      await client.request({
        method: 'GET',
        url: 'https://api.example.com/data',
        responseFormat: 'json',
        schema,
        cachePolicy: {
          namespace: 'default',
        },
      });

      fetchMock.mockJsonResponseOnce({ value: 2 });

      const response = await client.request({
        method: 'GET',
        url: 'https://api.example.com/data',
        responseFormat: 'json',
        schema,
        authToken: 'token-1',
        cachePolicy: {
          namespace: 'default',
        },
      });

      // With token vs without should be different keys
      expect(response.body.value).toBe(2);
      expect(fetchMock.getSpy()).toHaveBeenCalledTimes(2);
    });
  });

  describe('additional key parts', () => {
    test('generates different cache keys with different additional key parts', async () => {
      fetchMock.mockJsonResponseOnce({ value: 1 });

      await client.request({
        method: 'GET',
        url: 'https://api.example.com/data',
        responseFormat: 'json',
        schema,
        cachePolicy: {
          namespace: 'default',
          additionalKeyParts: ['part1'],
        },
      });

      fetchMock.mockJsonResponseOnce({ value: 2 });

      const response = await client.request({
        method: 'GET',
        url: 'https://api.example.com/data',
        responseFormat: 'json',
        schema,
        cachePolicy: {
          namespace: 'default',
          additionalKeyParts: ['part2'],
        },
      });

      // Different additional parts should fetch new data
      expect(response.body.value).toBe(2);
      expect(fetchMock.getSpy()).toHaveBeenCalledTimes(2);
    });

    test('generates same cache key with same additional key parts', async () => {
      fetchMock.mockJsonResponseOnce({ value: 1 });

      await client.request({
        method: 'GET',
        url: 'https://api.example.com/data',
        responseFormat: 'json',
        schema,
        cachePolicy: {
          namespace: 'default',
          additionalKeyParts: ['part1', 'part2'],
        },
      });

      fetchMock.mockJsonResponseOnce({ value: 2 });

      const response = await client.request({
        method: 'GET',
        url: 'https://api.example.com/data',
        responseFormat: 'json',
        schema,
        cachePolicy: {
          namespace: 'default',
          additionalKeyParts: ['part1', 'part2'],
        },
      });

      // Same additional parts should return cached value
      expect(response.body.value).toBe(1);
      expect(fetchMock.getSpy()).toHaveBeenCalledTimes(1);
    });
  });
});
