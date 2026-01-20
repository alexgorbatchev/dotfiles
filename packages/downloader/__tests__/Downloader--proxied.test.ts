import type { IFileSystem } from '@dotfiles/file-system';
import { createMemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { FetchMockHelper } from '@dotfiles/testing-helpers';
import type { ProxyFetchConfig } from '@dotfiles/utils';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { FileCache } from '../cache/FileCache';
import type { ICacheConfig } from '../cache/types';
import { Downloader } from '../Downloader';

describe('Downloader with Proxy', () => {
  let logger: TestLogger;
  let mockFileSystem: IFileSystem;
  let fetchMockHelper: FetchMockHelper;

  beforeEach(async () => {
    logger = new TestLogger();
    const { fs } = await createMemFileSystem();
    mockFileSystem = fs;
    fetchMockHelper = new FetchMockHelper();
    fetchMockHelper.setup();
    fetchMockHelper.reset();
  });

  afterEach(() => {
    fetchMockHelper.restore();
  });

  describe('constructor with proxy config', () => {
    it('should create NodeFetchStrategy with proxy when proxy enabled', () => {
      const proxyConfig: ProxyFetchConfig = { enabled: true, port: 3128 };
      const downloader = new Downloader(logger, mockFileSystem, undefined, undefined, proxyConfig);

      expect(downloader).toBeDefined();

      // Verify constructor log mentions NodeFetchStrategy with proxy port
      logger.expect(['DEBUG'], ['Downloader'], [], ['Created NodeFetchStrategy (proxy port 3128)']);
    });

    it('should create NodeFetchStrategy without proxy when proxy disabled', () => {
      const proxyConfig: ProxyFetchConfig = { enabled: false, port: 3128 };
      const downloader = new Downloader(logger, mockFileSystem, undefined, undefined, proxyConfig);

      expect(downloader).toBeDefined();

      // Verify constructor log mentions NodeFetchStrategy (no cache)
      logger.expect(['DEBUG'], ['Downloader'], [], ['Created NodeFetchStrategy (no cache)']);
    });

    it('should work without proxy config', () => {
      const downloader = new Downloader(logger, mockFileSystem);
      expect(downloader).toBeDefined();
    });
  });

  describe('download with proxy enabled', () => {
    const originalUrl = 'https://api.github.com/repos/owner/repo';
    const testData = '{"name": "repo"}';

    it('should route requests through proxy', async () => {
      const proxyConfig: ProxyFetchConfig = { enabled: true, port: 3128 };
      const downloader = new Downloader(logger, mockFileSystem, undefined, undefined, proxyConfig);

      fetchMockHelper.mockResponseOnce({
        status: 200,
        body: testData,
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await downloader.download(logger, originalUrl);

      expect(result).toEqual(Buffer.from(testData));

      // Verify fetch was called with proxied URL
      const spy = fetchMockHelper.getSpy();
      expect(spy).toHaveBeenCalledTimes(1);
      const calledUrl = spy.mock.calls[0]?.[0];
      expect(calledUrl).toBe(`http://localhost:3128/${originalUrl}`);
    });

    it('should use custom proxy port', async () => {
      const proxyConfig: ProxyFetchConfig = { enabled: true, port: 8080 };
      const downloader = new Downloader(logger, mockFileSystem, undefined, undefined, proxyConfig);

      fetchMockHelper.mockResponseOnce({
        status: 200,
        body: testData,
      });

      await downloader.download(logger, originalUrl);

      const spy = fetchMockHelper.getSpy();
      const calledUrl = spy.mock.calls[0]?.[0];
      expect(calledUrl).toBe(`http://localhost:8080/${originalUrl}`);
    });
  });

  describe('download with proxy and cache', () => {
    const originalUrl = 'https://api.github.com/repos/owner/repo';
    const testData = '{"name": "repo"}';

    it('should use both proxy and cache together', async () => {
      const proxyConfig: ProxyFetchConfig = { enabled: true, port: 3128 };
      const cacheConfig: ICacheConfig = {
        enabled: true,
        defaultTtl: 60000,
        cacheDir: '/cache/downloads',
        storageStrategy: 'binary',
      };
      const cache = new FileCache(logger, mockFileSystem, cacheConfig);
      const downloader = new Downloader(logger, mockFileSystem, undefined, cache, proxyConfig);

      // Verify logs show both cache and proxy
      logger.expect(['DEBUG'], ['Downloader'], [], [
        'CachedDownloadStrategy wrapping NodeFetchStrategy (proxy port 3128)',
      ]);

      fetchMockHelper.mockResponseOnce({
        status: 200,
        body: testData,
        headers: { 'Content-Type': 'application/json' },
      });

      // First request - goes through proxy, gets cached
      const result1 = await downloader.download(logger, originalUrl);
      expect(result1).toEqual(Buffer.from(testData));

      // Verify proxied URL was used
      const spy = fetchMockHelper.getSpy();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]?.[0]).toBe(`http://localhost:3128/${originalUrl}`);

      // Second request - should be cached, no network call
      const result2 = await downloader.download(logger, originalUrl);
      expect(result2).toEqual(Buffer.from(testData));

      // Fetch still only called once (cache hit)
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('download with proxy disabled', () => {
    const originalUrl = 'https://api.github.com/repos/owner/repo';
    const testData = '{"name": "repo"}';

    it('should not route through proxy when disabled', async () => {
      const proxyConfig: ProxyFetchConfig = { enabled: false, port: 3128 };
      const downloader = new Downloader(logger, mockFileSystem, undefined, undefined, proxyConfig);

      fetchMockHelper.mockResponseOnce({
        status: 200,
        body: testData,
      });

      await downloader.download(logger, originalUrl);

      // Verify fetch was called with original URL (not proxied)
      const spy = fetchMockHelper.getSpy();
      expect(spy).toHaveBeenCalledTimes(1);
      const calledUrl = spy.mock.calls[0]?.[0];
      expect(calledUrl).toBe(originalUrl);
    });
  });
});
