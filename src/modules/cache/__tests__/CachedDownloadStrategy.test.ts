import { describe, it, expect, beforeEach } from 'bun:test';
import { TestLogger, createMemFileSystem } from '@testing-helpers';
import { CachedDownloadStrategy } from '@modules/downloader/CachedDownloadStrategy';
import type { DownloadStrategy } from '@modules/downloader/DownloadStrategy';
import type { DownloadOptions } from '@modules/downloader/IDownloader';
import type { ICache } from '../ICache';
import type { IFileSystem } from '@modules/file-system';

class MockDownloadStrategy implements DownloadStrategy {
  public readonly name = 'mock-strategy';
  public downloadCalls: Array<{ url: string; options: DownloadOptions }> = [];
  public downloadResult: Buffer = Buffer.from('mock-download-result');
  public shouldFail = false;
  public isAvailableResult = true;

  async isAvailable(): Promise<boolean> {
    return this.isAvailableResult;
  }

  async download(url: string, options: DownloadOptions): Promise<Buffer | void> {
    this.downloadCalls.push({ url, options });
    if (this.shouldFail) {
      throw new Error('Mock download failed');
    }
    // Return void if destinationPath is provided, otherwise return buffer
    if (options.destinationPath) {
      return;
    }
    return this.downloadResult;
  }

  reset(): void {
    this.downloadCalls = [];
    this.downloadResult = Buffer.from('mock-download-result');
    this.shouldFail = false;
    this.isAvailableResult = true;
  }
}

class MockCache implements ICache {
  public storage = new Map<string, any>();
  public getCalls: string[] = [];
  public setCalls: Array<{ key: string; data: any; ttl?: number; metadata?: Record<string, unknown> }> = [];
  public shouldFailGet = false;
  public shouldFailSet = false;

  async get<T>(key: string): Promise<T | null> {
    this.getCalls.push(key);
    if (this.shouldFailGet) {
      throw new Error('Cache get failed');
    }
    return this.storage.get(key) || null;
  }

  async set<T>(key: string, data: T, ttlMs?: number, metadata?: Record<string, unknown>): Promise<void> {
    this.setCalls.push({ key, data, ttl: ttlMs, metadata });
    if (this.shouldFailSet) {
      throw new Error('Cache set failed');
    }
    this.storage.set(key, data);
  }

  async has(key: string): Promise<boolean> {
    return this.storage.has(key);
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async clearExpired(): Promise<void> {
    // Mock implementation
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }

  reset(): void {
    this.storage.clear();
    this.getCalls = [];
    this.setCalls = [];
    this.shouldFailGet = false;
    this.shouldFailSet = false;
  }
}

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
    it('should skip cache when progress callback is provided', async () => {
      const options: DownloadOptions = {
        onProgress: () => {},
      };
      
      const result = await cachedStrategy.download('https://example.com/file.txt', options);

      expect(result).toEqual(mockStrategy.downloadResult);
      expect(mockStrategy.downloadCalls).toHaveLength(1);
      expect(mockCache.getCalls).toHaveLength(0);
      expect(mockCache.setCalls).toHaveLength(0);
      logger.expect(
        ['TRACE'],
        ['CachedDownloadStrategy', 'download'],
        ['Cache disabled, caching for key:'],
      );
    });

    it('should use cache when destination path is provided', async () => {
      const options: DownloadOptions = {
        destinationPath: '/tmp/file.txt',
      };
      
      const result = await cachedStrategy.download('https://example.com/file.txt', options);

      expect(result).toBeUndefined(); // Should return void for file downloads
      expect(mockStrategy.downloadCalls).toHaveLength(1);
      expect(mockCache.getCalls).toHaveLength(1); // Should check cache
      expect(mockCache.setCalls).toHaveLength(0); // Won't cache because file doesn't exist in mock
    });

    it('should return cached data when available', async () => {
      const cachedData = Buffer.from('cached-data');
      
      // Mock get to return cached data
      const originalGet = mockCache.get;
      mockCache.get = async <T>(key: string): Promise<T | null> => {
        mockCache.getCalls.push(key);
        return cachedData as T;
      };
      
      const result = await cachedStrategy.download('https://example.com/file.txt') as Buffer;

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
      expect(mockCache.setCalls).toHaveLength(1);
      
      expect(mockCache.setCalls).toHaveLength(1);
      const setCall = mockCache.setCalls[0];
      expect(setCall).toBeDefined();
      if (setCall) {
        expect(setCall.data).toEqual(downloadResult); // Now stored as Buffer directly
        expect(setCall.ttl).toBe(60000);
        expect(setCall.metadata).toEqual({
          url: 'https://example.com/file.txt',
          contentType: undefined,
        });
      }
    });

    it('should include content type from Accept header in metadata', async () => {
      const options: DownloadOptions = {
        headers: {
          'Accept': 'application/json',
        },
      };
      const downloadResult = Buffer.from('{"data": "test"}');
      mockStrategy.downloadResult = downloadResult;
      
      await cachedStrategy.download('https://example.com/file.json', options);

      const setCall = mockCache.setCalls[0];
      expect(setCall).toBeDefined();
      if (setCall) {
        expect(setCall.metadata).toEqual({
          url: 'https://example.com/file.json',
          contentType: 'application/json',
        });
      }
    });

    it('should continue download when cache check fails', async () => {
      mockCache.shouldFailGet = true;
      const downloadResult = Buffer.from('downloaded-data');
      mockStrategy.downloadResult = downloadResult;
      
      const result = await cachedStrategy.download('https://example.com/file.txt');

      expect(result).toEqual(downloadResult);
      expect(mockStrategy.downloadCalls).toHaveLength(1);
      // Should still attempt to cache the result after download
      expect(mockCache.setCalls).toHaveLength(1);
      
      // Check all logs in order
      logger.expect(
        ['TRACE'],
        ['CachedDownloadStrategy', 'download'],
        [
          /Error checking cache for key: download:[a-f0-9]{64}, error: Cache get failed/,
          /download from mock-strategy/,
          /Cached data for key: download:[a-f0-9]{64} \(binary\), size: 15 bytes, expires: TTL-based/
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
        [
          /No cache entry found for key: download:[a-f0-9]{64}/,
          /download from mock-strategy/,
          /Error caching data for key: download:[a-f0-9]{64}, error: Cache set failed/
        ],
      );
    });

    it('should propagate download errors from underlying strategy', async () => {
      mockStrategy.shouldFail = true;
      
      await expect(cachedStrategy.download('https://example.com/file.txt'))
        .rejects.toThrow('Mock download failed');
    });

    it('should handle different URLs with different cache keys', async () => {
      await cachedStrategy.download('https://example.com/file1.txt');
      await cachedStrategy.download('https://example.com/file2.txt');

      expect(mockStrategy.downloadCalls).toHaveLength(2);
      expect(mockCache.setCalls).toHaveLength(2);
      const setCall1 = mockCache.setCalls[0];
      const setCall2 = mockCache.setCalls[1];
      expect(setCall1).toBeDefined();
      expect(setCall2).toBeDefined();
      if (setCall1 && setCall2) {
        expect(setCall1.key).not.toBe(setCall2.key);
      }
    });

    it('should handle headers affecting cache keys', async () => {
      const options1: DownloadOptions = { headers: { 'Authorization': 'Bearer token1' } };
      const options2: DownloadOptions = { headers: { 'Authorization': 'Bearer token2' } };

      await cachedStrategy.download('https://example.com/file.txt', options1);
      await cachedStrategy.download('https://example.com/file.txt', options2);

      expect(mockStrategy.downloadCalls).toHaveLength(2);
      expect(mockCache.setCalls).toHaveLength(2);
      const setCall1 = mockCache.setCalls[0];
      const setCall2 = mockCache.setCalls[1];
      expect(setCall1).toBeDefined();
      expect(setCall2).toBeDefined();
      if (setCall1 && setCall2) {
        expect(setCall1.key).not.toBe(setCall2.key);
      }
    });
  });
});