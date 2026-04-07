import { createMemFileSystem, type IFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { beforeEach, describe, expect, it } from 'bun:test';
import assert from 'node:assert';
import { createCacheKey } from '../../cache/helpers';
import { CachedDownloadStrategy } from '../../CachedDownloadStrategy';
import type { IDownloadOptions } from '../../IDownloader';
import { MockCache, MockDownloadStrategy } from './helpers/mocks';

describe('CachedDownloadStrategy', () => {
  let logger: TestLogger;
  let mockCache: MockCache;
  let mockStrategy: MockDownloadStrategy;
  let mockFileSystem: IFileSystem;
  let cachedStrategy: CachedDownloadStrategy;

  beforeEach(async () => {
    logger = new TestLogger();
    mockCache = new MockCache();
    mockStrategy = new MockDownloadStrategy();
    const { fs } = await createMemFileSystem();
    mockFileSystem = fs;
    cachedStrategy = new CachedDownloadStrategy(logger, mockFileSystem, mockCache, mockStrategy, 60000);
  });

  describe('constructor', () => {
    it('should create CachedDownloadStrategy with correct name', () => {
      expect(cachedStrategy.name).toBe('cached-mock-strategy');
      logger.expect(
        ['DEBUG'],
        ['CachedDownloadStrategy'],
        [],
        ['Wrapping strategy mock-strategy with cache, TTL: 60000 ms'],
      );
    });
  });

  describe('isAvailable', () => {
    it('should delegate to underlying strategy', async () => {
      mockStrategy.isAvailableResult = true;

      const result = await cachedStrategy.isAvailable();

      expect(result).toBe(true);
    });

    it('should return false when underlying strategy is not available', async () => {
      mockStrategy.isAvailableResult = false;

      const result = await cachedStrategy.isAvailable();

      expect(result).toBe(false);
    });
  });

  describe('download', () => {
    it('should read from cache when progress callback is provided', async () => {
      const url = 'https://example.com/file.txt';
      const progressCalls: Array<{ loaded: number; total: number | null; }> = [];
      const options: IDownloadOptions = {
        onProgress: (loaded, total) => {
          progressCalls.push({ loaded, total });
        },
      };

      const cacheKey = createCacheKey(url, options);
      mockCache.storage.set(cacheKey, Buffer.from('cached-data'));

      const result = await cachedStrategy.download(url, options);

      expect(result).toEqual(Buffer.from('cached-data'));
      expect(mockStrategy.downloadCalls).toHaveLength(0);
      expect(mockCache.getCalls).toHaveLength(1);
      expect(mockCache.setDownloadCalls).toHaveLength(0);
      expect(progressCalls).toEqual([
        { loaded: 0, total: 11 },
        { loaded: 11, total: 11 },
      ]);
      logger.expect(
        ['TRACE'],
        ['CachedDownloadStrategy', 'download'],
        [],
        [/Cache hit for key: download:[a-f0-9]{64} \(binary\), size: 11 bytes/],
      );
    });

    it('should use cache when destination path is provided', async () => {
      const options: IDownloadOptions = {
        destinationPath: '/tmp/file.txt',
      };

      const result = await cachedStrategy.download('https://example.com/file.txt', options);

      expect(result).toBeUndefined(); // Should return void for file downloads
      expect(mockStrategy.downloadCalls).toHaveLength(1);
      expect(mockCache.getCalls).toHaveLength(1); // Should check cache
      expect(mockCache.setDownloadCalls).toHaveLength(0); // Won't cache because file doesn't exist in mock
    });

    it('should return cached data when available', async () => {
      const cachedData = Buffer.from('cached-data');

      // Mock get to return cached data
      const originalGet = mockCache.get;
      mockCache.get = async <T>(key: string): Promise<T | null> => {
        mockCache.getCalls.push(key);
        return cachedData as T;
      };

      const result = (await cachedStrategy.download('https://example.com/file.txt')) as Buffer;

      expect(result).toEqual(Buffer.from('cached-data'));
      expect(mockStrategy.downloadCalls).toHaveLength(0); // Should not call underlying strategy
      expect(mockCache.getCalls).toHaveLength(1);

      // Restore original get method
      mockCache.get = originalGet;
    });

    it('should download and cache when cache miss occurs', async () => {
      const downloadResult = Buffer.from('downloaded-data');
      mockStrategy.downloadResult = downloadResult;

      const result = await cachedStrategy.download('https://example.com/file.txt');

      expect(result).toEqual(downloadResult);
      expect(mockStrategy.downloadCalls).toHaveLength(1);
      expect(mockCache.getCalls).toHaveLength(1);
      expect(mockCache.setDownloadCalls).toHaveLength(1);

      expect(mockCache.setDownloadCalls).toHaveLength(1);
      const setCall = mockCache.setDownloadCalls[0];
      expect(setCall).toBeDefined();
      assert(setCall);
      expect(setCall.data).toEqual(downloadResult);
      expect(setCall.ttl).toBe(60000);
      expect(setCall.url).toBe('https://example.com/file.txt');
      expect(setCall.contentType).toBeUndefined();
    });

    it('should include content type from Accept header in metadata', async () => {
      const options: IDownloadOptions = {
        headers: {
          Accept: 'application/json',
        },
      };
      const downloadResult = Buffer.from('{"data": "test"}');
      mockStrategy.downloadResult = downloadResult;

      await cachedStrategy.download('https://example.com/file.json', options);

      const setCall = mockCache.setDownloadCalls[0];
      expect(setCall).toBeDefined();
      assert(setCall);
      expect(setCall.url).toBe('https://example.com/file.json');
      expect(setCall.contentType).toBe('application/json');
    });

    it('should continue download when cache check fails', async () => {
      mockCache.shouldFailGet = true;
      const downloadResult = Buffer.from('downloaded-data');
      mockStrategy.downloadResult = downloadResult;

      const result = await cachedStrategy.download('https://example.com/file.txt');

      expect(result).toEqual(downloadResult);
      expect(mockStrategy.downloadCalls).toHaveLength(1);
      // Should still attempt to cache the result after download
      expect(mockCache.setDownloadCalls).toHaveLength(1);

      // Check all logs in order
      logger.expect(
        ['TRACE'],
        ['CachedDownloadStrategy', 'download'],
        [],
        [
          /Error checking cache for key: download:[a-f0-9]{64}/,
          /download from mock-strategy/,
          /Cached data for key: download:[a-f0-9]{64} \(binary\), size: 15 bytes, expires: TTL-based/,
        ],
      );
    });

    it('should not fail download when caching fails', async () => {
      mockCache.shouldFailSet = true;
      const downloadResult = Buffer.from('downloaded-data');
      mockStrategy.downloadResult = downloadResult;

      const result = await cachedStrategy.download('https://example.com/file.txt');

      expect(result).toEqual(downloadResult);
      expect(mockStrategy.downloadCalls).toHaveLength(1);
      // Check all logs in order
      logger.expect(
        ['TRACE'],
        ['CachedDownloadStrategy', 'download'],
        [],
        [
          /No cache entry found for key: download:[a-f0-9]{64}/,
          /download from mock-strategy/,
          /Error caching data for key: download:[a-f0-9]{64}/,
        ],
      );
    });

    it('should propagate download errors from underlying strategy', async () => {
      mockStrategy.shouldFail = true;

      expect(cachedStrategy.download('https://example.com/file.txt')).rejects.toThrow('Mock download failed');
    });

    it('should handle different URLs with different cache keys', async () => {
      await cachedStrategy.download('https://example.com/file1.txt');
      await cachedStrategy.download('https://example.com/file2.txt');

      expect(mockStrategy.downloadCalls).toHaveLength(2);
      expect(mockCache.setDownloadCalls).toHaveLength(2);
      const setCall1 = mockCache.setDownloadCalls[0];
      const setCall2 = mockCache.setDownloadCalls[1];
      expect(setCall1).toBeDefined();
      expect(setCall2).toBeDefined();
      assert(setCall1);
      assert(setCall2);
      expect(setCall1.key).not.toBe(setCall2.key);
    });

    it('should handle headers affecting cache keys', async () => {
      const options1: IDownloadOptions = { headers: { Authorization: 'Bearer token1' } };
      const options2: IDownloadOptions = { headers: { Authorization: 'Bearer token2' } };

      await cachedStrategy.download('https://example.com/file.txt', options1);
      await cachedStrategy.download('https://example.com/file.txt', options2);

      expect(mockStrategy.downloadCalls).toHaveLength(2);
      expect(mockCache.setDownloadCalls).toHaveLength(2);
      const setCall1 = mockCache.setDownloadCalls[0];
      const setCall2 = mockCache.setDownloadCalls[1];
      expect(setCall1).toBeDefined();
      expect(setCall2).toBeDefined();
      assert(setCall1);
      assert(setCall2);
      expect(setCall1.key).not.toBe(setCall2.key);
    });
  });
});
