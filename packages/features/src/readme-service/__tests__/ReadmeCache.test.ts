import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { ICache } from '@dotfiles/downloader';
import type { TsLogger } from '@dotfiles/logger';
import { TestLogger } from '@dotfiles/logger';
import { ReadmeCache } from '../ReadmeCache';
import type { ReadmeContent } from '../types';

describe('ReadmeCache', () => {
  let logger: TsLogger;
  let mockCache: ICache;
  let readmeCache: ReadmeCache;

  beforeEach(() => {
    logger = new TestLogger();

    mockCache = {
      get: mock(async () => null),
      set: mock(async () => {}),
      has: mock(async () => false),
      delete: mock(async () => {}),
      clearExpired: mock(async () => {}),
      clear: mock(async () => {}),
      setDownload: mock(async () => {}),
    };

    readmeCache = new ReadmeCache(logger, mockCache);
  });

  describe('generateCacheKey', () => {
    test('should generate consistent cache key', () => {
      const key1: string = readmeCache.generateCacheKey('owner', 'repo', 'v1.0.0');
      const key2: string = readmeCache.generateCacheKey('owner', 'repo', 'v1.0.0');

      expect(key1).toBe(key2);
      expect(key1).toBe('readme:owner/repo:v1.0.0');
    });

    test('should generate different keys for different inputs', () => {
      const key1: string = readmeCache.generateCacheKey('owner1', 'repo1', 'v1.0.0');
      const key2: string = readmeCache.generateCacheKey('owner2', 'repo2', 'v2.0.0');

      expect(key1).not.toBe(key2);
    });
  });

  describe('get', () => {
    test('should return cached content when available', async () => {
      const mockContent: ReadmeContent = {
        content: '# Test',
        toolName: 'test-tool',
        owner: 'owner',
        repo: 'repo',
        version: 'v1.0.0',
        sourceUrl: 'https://example.com',
        fetchedAt: Date.now(),
      };

      (mockCache.get as ReturnType<typeof mock>).mockResolvedValueOnce(mockContent);

      const result: ReadmeContent | null = await readmeCache.get('test-key');

      expect(result).toEqual(mockContent);
      expect(mockCache.get).toHaveBeenCalledWith('test-key');
    });

    test('should return null when cache miss', async () => {
      (mockCache.get as ReturnType<typeof mock>).mockResolvedValueOnce(null);

      const result: ReadmeContent | null = await readmeCache.get('test-key');

      expect(result).toBeNull();
    });

    test('should handle cache errors gracefully', async () => {
      (mockCache.get as ReturnType<typeof mock>).mockRejectedValueOnce(new Error('Cache error'));

      const result: ReadmeContent | null = await readmeCache.get('test-key');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    test('should store content in cache', async () => {
      const content: ReadmeContent = {
        content: '# Test',
        toolName: 'test-tool',
        owner: 'owner',
        repo: 'repo',
        version: 'v1.0.0',
        sourceUrl: 'https://example.com',
        fetchedAt: Date.now(),
      };

      await readmeCache.set('test-key', content, 3600000);

      expect(mockCache.set).toHaveBeenCalledWith('test-key', content, 3600000);
    });

    test('should handle cache errors gracefully', async () => {
      const content: ReadmeContent = {
        content: '# Test',
        toolName: 'test-tool',
        owner: 'owner',
        repo: 'repo',
        version: 'v1.0.0',
        sourceUrl: 'https://example.com',
        fetchedAt: Date.now(),
      };

      (mockCache.set as ReturnType<typeof mock>).mockRejectedValueOnce(new Error('Cache error'));

      // Should not throw, should handle error gracefully
      await readmeCache.set('test-key', content);
      expect(mockCache.set).toHaveBeenCalledWith('test-key', content, expect.any(Number));
    });
  });

  describe('has', () => {
    test('should check cache existence', async () => {
      (mockCache.has as ReturnType<typeof mock>).mockResolvedValueOnce(true);

      const result: boolean = await readmeCache.has('test-key');

      expect(result).toBe(true);
      expect(mockCache.has).toHaveBeenCalledWith('test-key');
    });

    test('should handle cache errors gracefully', async () => {
      (mockCache.has as ReturnType<typeof mock>).mockRejectedValueOnce(new Error('Cache error'));

      const result: boolean = await readmeCache.has('test-key');

      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    test('should delete from cache', async () => {
      await readmeCache.delete('test-key');

      expect(mockCache.delete).toHaveBeenCalledWith('test-key');
    });

    test('should handle cache errors gracefully', async () => {
      (mockCache.delete as ReturnType<typeof mock>).mockRejectedValueOnce(new Error('Cache error'));

      // Should not throw, should handle error gracefully
      await readmeCache.delete('test-key');
      expect(mockCache.delete).toHaveBeenCalledWith('test-key');
    });
  });

  describe('clearExpired', () => {
    test('should clear expired entries', async () => {
      await readmeCache.clearExpired();

      expect(mockCache.clearExpired).toHaveBeenCalled();
    });

    test('should handle cache errors gracefully', async () => {
      (mockCache.clearExpired as ReturnType<typeof mock>).mockRejectedValueOnce(new Error('Cache error'));

      // Should not throw, should handle error gracefully
      await readmeCache.clearExpired();
      expect(mockCache.clearExpired).toHaveBeenCalled();
    });
  });
});
