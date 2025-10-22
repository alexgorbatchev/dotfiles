import { describe, expect, it } from 'bun:test';
import type { DownloadOptions } from '../../IDownloader';
import { createApiCacheKey, createCacheKey, isApiKey, isDownloadKey } from '../helpers';

describe('DownloadCacheUtils functions', () => {
  describe('createCacheKey', () => {
    it('should create consistent cache key for same URL', () => {
      const key1 = createCacheKey('https://example.com/file.txt');
      const key2 = createCacheKey('https://example.com/file.txt');

      expect(key1).toBe(key2);
      expect(key1).toStartWith('download:');
    });

    it('should create different cache keys for different URLs', () => {
      const key1 = createCacheKey('https://example.com/file1.txt');
      const key2 = createCacheKey('https://example.com/file2.txt');

      expect(key1).not.toBe(key2);
    });

    it('should include relevant headers in cache key', () => {
      const options1: DownloadOptions = {
        headers: { Authorization: 'Bearer token1' },
      };
      const options2: DownloadOptions = {
        headers: { Authorization: 'Bearer token2' },
      };

      const key1 = createCacheKey('https://example.com/file.txt', options1);
      const key2 = createCacheKey('https://example.com/file.txt', options2);

      expect(key1).not.toBe(key2);
    });

    it('should ignore non-content-affecting options', () => {
      const options1: DownloadOptions = {
        timeout: 5000,
        retryCount: 3,
        onProgress: () => {},
      };
      const options2: DownloadOptions = {
        timeout: 10000,
        retryCount: 5,
        onProgress: () => {},
      };

      const key1 = createCacheKey('https://example.com/file.txt', options1);
      const key2 = createCacheKey('https://example.com/file.txt', options2);

      expect(key1).toBe(key2);
    });

    it('should handle empty options', () => {
      const key1 = createCacheKey('https://example.com/file.txt');
      const key2 = createCacheKey('https://example.com/file.txt', {});

      expect(key1).toBe(key2);
    });

    it('should create valid filename-safe cache key', () => {
      const key = createCacheKey('https://example.com/file with spaces & symbols!.txt');

      expect(key).toMatch(/^download:[a-f0-9]{64}$/);
      expect(key).not.toContain(' ');
      expect(key).not.toContain('&');
      expect(key).not.toContain('!');
    });
  });

  describe('createApiCacheKey', () => {
    it('should create consistent cache key for same API URL', () => {
      const key1 = createApiCacheKey('https://api.example.com/users');
      const key2 = createApiCacheKey('https://api.example.com/users');

      expect(key1).toBe(key2);
      expect(key1).toStartWith('api:');
    });

    it('should create different cache keys for different API URLs', () => {
      const key1 = createApiCacheKey('https://api.example.com/users');
      const key2 = createApiCacheKey('https://api.example.com/posts');

      expect(key1).not.toBe(key2);
    });

    it('should include headers in API cache key', () => {
      const headers1 = { Authorization: 'Bearer token1' };
      const headers2 = { Authorization: 'Bearer token2' };

      const key1 = createApiCacheKey('https://api.example.com/users', headers1);
      const key2 = createApiCacheKey('https://api.example.com/users', headers2);

      expect(key1).not.toBe(key2);
    });

    it('should handle undefined headers', () => {
      const key1 = createApiCacheKey('https://api.example.com/users');
      const key2 = createApiCacheKey('https://api.example.com/users', undefined);

      expect(key1).toBe(key2);
    });

    it('should create valid filename-safe API cache key', () => {
      const key = createApiCacheKey('https://api.example.com/users?filter=name with spaces');

      expect(key).toMatch(/^api:[a-f0-9]{64}$/);
      expect(key).not.toContain(' ');
      expect(key).not.toContain('?');
      expect(key).not.toContain('=');
    });
  });

  describe('isDownloadKey', () => {
    it('should return true for download keys', () => {
      const downloadKey = createCacheKey('https://example.com/file.txt');
      expect(isDownloadKey(downloadKey)).toBe(true);
    });

    it('should return false for API keys', () => {
      const apiKey = createApiCacheKey('https://api.example.com/users');
      expect(isDownloadKey(apiKey)).toBe(false);
    });

    it('should return false for other keys', () => {
      expect(isDownloadKey('random-key')).toBe(false);
      expect(isDownloadKey('other:hash123')).toBe(false);
    });
  });

  describe('isApiKey', () => {
    it('should return true for API keys', () => {
      const apiKey = createApiCacheKey('https://api.example.com/users');
      expect(isApiKey(apiKey)).toBe(true);
    });

    it('should return false for download keys', () => {
      const downloadKey = createCacheKey('https://example.com/file.txt');
      expect(isApiKey(downloadKey)).toBe(false);
    });

    it('should return false for other keys', () => {
      expect(isApiKey('random-key')).toBe(false);
      expect(isApiKey('other:hash123')).toBe(false);
    });
  });
});
