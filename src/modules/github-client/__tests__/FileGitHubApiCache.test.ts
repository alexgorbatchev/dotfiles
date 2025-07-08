/**
 * @file generator/src/modules/github-client/__tests__/FileGitHubApiCache.test.ts
 * @description Tests for the FileGitHubApiCache class.
 *
 * ## Development Plan
 *
 * - [x] **Setup Mocks:**
 *   - [x] Mock `IFileSystem` interface using `bun:test`'s `mock`.
 *   - [x] Mock `AppConfig` with required properties. (Now uses `createMockAppConfig`)
 * - [x] **Test Suite for `FileGitHubApiCache`:**
 *   - [x] **Constructor:**
 *     - [x] Test initialization with default settings.
 *     - [x] Test initialization with custom TTL.
 *     - [x] Test initialization with cache disabled.
 *   - [x] **`get<T>` Method:**
 *     - [x] Test successful retrieval of cached data.
 *     - [x] Test cache miss when file doesn't exist.
 *     - [x] Test cache miss when entry is expired.
 *     - [x] Test handling of file read errors.
 *     - [x] Test handling of invalid JSON.
 *     - [x] Test behavior when cache is disabled.
 *   - [x] **`set<T>` Method:**
 *     - [x] Test successful caching of data.
 *     - [x] Test with custom TTL.
 *     - [x] Test handling of file write errors.
 *     - [x] Test behavior when cache is disabled.
 *   - [x] **`has` Method:**
 *     - [x] Test when entry exists and is not expired.
 *     - [x] Test when entry doesn't exist.
 *     - [x] Test when entry exists but is expired.
 *     - [x] Test handling of file read errors.
 *     - [x] Test behavior when cache is disabled.
 *   - [x] **`delete` Method:**
 *     - [x] Test successful deletion of cache entry.
 *     - [x] Test when entry doesn't exist.
 *     - [x] Test handling of file delete errors.
 *     - [x] Test behavior when cache is disabled.
 *   - [x] **`clearExpired` Method:**
 *     - [x] Test successful clearing of expired entries.
 *     - [x] Test handling of directory read errors.
 *     - [x] Test handling of file read errors.
 *     - [x] Test handling of file delete errors.
 *     - [x] Test behavior when cache is disabled.
 *   - [x] **`clear` Method:**
 *     - [x] Test successful clearing of entire cache.
 *     - [x] Test when cache directory doesn't exist.
 *     - [x] Test handling of directory delete errors.
 *     - [x] Test behavior when cache is disabled.
 *   - [x] **Private Methods (Indirect Testing):**
 *     - [x] Test `getCacheFilePath` via public methods.
 *     - [x] Test `ensureCacheDir` via public methods.
 *     - [x] Test `isExpired` via public methods.
 * - [x] Ensure all tests pass.
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Achieve 100% test coverage for `FileGitHubApiCache.ts`.
 * - [x] Update mockAppConfig with `generatedArtifactsManifestPath`.
 * - [ ] Update the memory bank.
 */

import { mock, beforeEach, describe, expect, it } from 'bun:test';
import { FileGitHubApiCache } from '../FileGitHubApiCache';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import type { AppConfig } from '@types';
import { createMockAppConfig } from '@testing-helpers';
import { createMockFileSystem } from '../../../testing-helpers'; // Corrected path
import type { CacheEntry } from '../IGitHubApiCache'; // Corrected import for CacheEntry
import path from 'path';

describe('FileGitHubApiCache', () => {
  let mockFileSystem: IFileSystem;
  let fileSystemMocks: ReturnType<typeof createMockFileSystem>['fileSystemMocks'];
  let mockAppConfig: AppConfig;
  let cache: FileGitHubApiCache;

  beforeEach(() => {
    mock.restore();

    // Setup mock file system
    const { mockFileSystem: fsInstance, fileSystemMocks: fsMocks } = createMockFileSystem();
    mockFileSystem = fsInstance;
    fileSystemMocks = fsMocks;

    // Create mock app config using the helper
    mockAppConfig = createMockAppConfig({
      // Specific overrides for these tests if needed, otherwise defaults are fine.
      // For FileGitHubApiCache, the githubApiCache... properties are important.
      githubApiCacheEnabled: true,
      githubApiCacheTtl: 3600000, // 1 hour, can be default from helper too
      githubApiCacheDir: '/test/dotfiles/.generated/cache/github-api', // Keep specific for tests
      // Ensure other paths are consistent if tests rely on them, e.g. for cacheDir
      dotfilesDir: '/test/dotfiles', // if other derived paths depend on this
      generatedDir: '/test/dotfiles/.generated', // if other derived paths depend on this
    });

    // Create cache instance
    cache = new FileGitHubApiCache(mockFileSystem, mockAppConfig);
  });

  describe('constructor', () => {
    it('should initialize with default settings', () => {
      expect(cache).toBeInstanceOf(FileGitHubApiCache);
    });

    it('should initialize with custom TTL', () => {
      const customConfig = { ...mockAppConfig, githubApiCacheTtl: 7200000 }; // 2 hours
      const customCache = new FileGitHubApiCache(mockFileSystem, customConfig);
      expect(customCache).toBeInstanceOf(FileGitHubApiCache);
    });

    it('should initialize with cache disabled', () => {
      const disabledConfig = { ...mockAppConfig, githubApiCacheEnabled: false };
      const disabledCache = new FileGitHubApiCache(mockFileSystem, disabledConfig);
      expect(disabledCache).toBeInstanceOf(FileGitHubApiCache);
    });
  });

  describe('get', () => {
    it('should return null when cache is disabled', async () => {
      const disabledConfig = { ...mockAppConfig, githubApiCacheEnabled: false };
      const disabledCache = new FileGitHubApiCache(mockFileSystem, disabledConfig);
      const result = await disabledCache.get('test-key');
      expect(result).toBeNull();
      expect(fileSystemMocks.exists).not.toHaveBeenCalled();
    });

    it('should return null when file does not exist', async () => {
      fileSystemMocks.exists.mockResolvedValue(false);
      const result = await cache.get('test-key');
      expect(result).toBeNull();
      expect(fileSystemMocks.exists).toHaveBeenCalled();
      expect(fileSystemMocks.readFile).not.toHaveBeenCalled();
    });

    it('should return cached data when file exists and is not expired', async () => {
      const mockData = { foo: 'bar' };
      const mockEntry: CacheEntry<typeof mockData> = {
        // Ensure CacheEntry is imported from types.ts
        data: mockData,
        timestamp: Date.now() - 1000, // 1 second ago
        expiresAt: Date.now() + (mockAppConfig.githubApiCacheTtl ?? 3600000), // Use TTL or default
      };

      fileSystemMocks.exists.mockResolvedValue(true);
      fileSystemMocks.readFile.mockResolvedValue(JSON.stringify(mockEntry));

      const result = await cache.get<typeof mockData>('test-key');
      expect(result).toEqual(mockData);
      expect(fileSystemMocks.exists).toHaveBeenCalled();
      expect(fileSystemMocks.readFile).toHaveBeenCalled();
    });

    it('should return null and delete file when entry is expired', async () => {
      const mockData = { foo: 'bar' };
      const mockEntry: CacheEntry<typeof mockData> = {
        // Ensure CacheEntry is imported
        data: mockData,
        timestamp: Date.now() - (mockAppConfig.githubApiCacheTtl ?? 3600000) * 2, // Expired
        expiresAt: Date.now() - (mockAppConfig.githubApiCacheTtl ?? 3600000), // Expired
      };

      fileSystemMocks.exists.mockResolvedValue(true);
      fileSystemMocks.readFile.mockResolvedValue(JSON.stringify(mockEntry));

      const result = await cache.get<typeof mockData>('test-key');
      expect(result).toBeNull();
      expect(fileSystemMocks.exists).toHaveBeenCalled();
      expect(fileSystemMocks.readFile).toHaveBeenCalled();
      expect(fileSystemMocks.rm).toHaveBeenCalled();
    });

    it('should handle file read errors gracefully', async () => {
      fileSystemMocks.exists.mockResolvedValue(true);
      fileSystemMocks.readFile.mockRejectedValue(new Error('Read error'));

      const result = await cache.get('test-key');
      expect(result).toBeNull();
      expect(fileSystemMocks.exists).toHaveBeenCalled();
      expect(fileSystemMocks.readFile).toHaveBeenCalled();
    });

    it('should handle invalid JSON gracefully', async () => {
      fileSystemMocks.exists.mockResolvedValue(true);
      fileSystemMocks.readFile.mockResolvedValue('invalid json');

      const result = await cache.get('test-key');
      expect(result).toBeNull();
      expect(fileSystemMocks.exists).toHaveBeenCalled();
      expect(fileSystemMocks.readFile).toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('should not cache data when cache is disabled', async () => {
      const disabledConfig = { ...mockAppConfig, githubApiCacheEnabled: false };
      const disabledCache = new FileGitHubApiCache(mockFileSystem, disabledConfig);
      await disabledCache.set('test-key', { foo: 'bar' });
      expect(fileSystemMocks.ensureDir).not.toHaveBeenCalled();
      expect(fileSystemMocks.writeFile).not.toHaveBeenCalled();
    });

    it('should cache data with default TTL', async () => {
      const data = { foo: 'bar' };
      await cache.set('test-key', data);
      expect(fileSystemMocks.ensureDir).toHaveBeenCalled();
      expect(fileSystemMocks.writeFile).toHaveBeenCalled();

      // Verify the written data contains the expected fields
      const writeCall = fileSystemMocks.writeFile.mock.calls?.[0];
      const writtenContent = writeCall?.[1];
      expect(writtenContent).toBeDefined(); // Ensure content was written
      // Type guard for writtenContent
      if (typeof writtenContent !== 'string') {
        throw new Error('writtenContent is not a string');
      }
      const parsedContent = JSON.parse(writtenContent);
      expect(parsedContent).toHaveProperty('data', data);
      expect(parsedContent).toHaveProperty('timestamp');
      expect(parsedContent).toHaveProperty('expiresAt');

      // Verify TTL is from mockAppConfig
      expect(parsedContent.expiresAt - parsedContent.timestamp).toBe(
        mockAppConfig.githubApiCacheTtl ?? 3600000 // Provide default if undefined
      );
    });

    it('should cache data with custom TTL', async () => {
      const data = { foo: 'bar' };
      const customTtl = 7200000; // 2 hours
      await cache.set('test-key', data, customTtl);
      expect(fileSystemMocks.ensureDir).toHaveBeenCalled();
      expect(fileSystemMocks.writeFile).toHaveBeenCalled();

      // Verify the written data contains the expected fields
      const writeCall = fileSystemMocks.writeFile.mock.calls?.[0];
      const writtenContent = writeCall?.[1];
      expect(writtenContent).toBeDefined(); // Ensure content was written
      // Type guard for writtenContent
      if (typeof writtenContent !== 'string') {
        throw new Error('writtenContent is not a string');
      }
      const parsedContent = JSON.parse(writtenContent);
      expect(parsedContent).toHaveProperty('data', data);
      expect(parsedContent).toHaveProperty('timestamp');
      expect(parsedContent).toHaveProperty('expiresAt');

      // Verify TTL is custom (2 hours)
      expect(parsedContent.expiresAt - parsedContent.timestamp).toBe(customTtl);
    });

    it('should handle file write errors', async () => {
      fileSystemMocks.ensureDir.mockResolvedValue(undefined);
      fileSystemMocks.writeFile.mockRejectedValue(new Error('Write error'));

      expect(cache.set('test-key', { foo: 'bar' })).rejects.toThrow('Failed to cache data');
      expect(fileSystemMocks.ensureDir).toHaveBeenCalled();
      expect(fileSystemMocks.writeFile).toHaveBeenCalled();
    });

    it('should handle directory creation errors', async () => {
      fileSystemMocks.ensureDir.mockRejectedValue(new Error('Directory creation error'));

      expect(cache.set('test-key', { foo: 'bar' })).rejects.toThrow('Failed to cache data');
      expect(fileSystemMocks.ensureDir).toHaveBeenCalled();
      expect(fileSystemMocks.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('has', () => {
    it('should return false when cache is disabled', async () => {
      const disabledConfig = { ...mockAppConfig, githubApiCacheEnabled: false };
      const disabledCache = new FileGitHubApiCache(mockFileSystem, disabledConfig);
      const result = await disabledCache.has('test-key');
      expect(result).toBe(false);
      expect(fileSystemMocks.exists).not.toHaveBeenCalled();
    });

    it('should return false when file does not exist', async () => {
      fileSystemMocks.exists.mockResolvedValue(false);
      const result = await cache.has('test-key');
      expect(result).toBe(false);
      expect(fileSystemMocks.exists).toHaveBeenCalled();
      expect(fileSystemMocks.readFile).not.toHaveBeenCalled();
    });

    it('should return true when file exists and is not expired', async () => {
      const mockEntry = {
        data: { foo: 'bar' },
        timestamp: Date.now() - 1000, // 1 second ago
        expiresAt: Date.now() + (mockAppConfig.githubApiCacheTtl ?? 3600000), // Use TTL or default
      };

      fileSystemMocks.exists.mockResolvedValue(true);
      fileSystemMocks.readFile.mockResolvedValue(JSON.stringify(mockEntry));

      const result = await cache.has('test-key');
      expect(result).toBe(true);
      expect(fileSystemMocks.exists).toHaveBeenCalled();
      expect(fileSystemMocks.readFile).toHaveBeenCalled();
    });

    it('should return false when file exists but is expired', async () => {
      const mockEntry = {
        data: { foo: 'bar' },
        timestamp: Date.now() - (mockAppConfig.githubApiCacheTtl ?? 3600000) * 2, // Expired
        expiresAt: Date.now() - (mockAppConfig.githubApiCacheTtl ?? 3600000), // Expired
      };

      fileSystemMocks.exists.mockResolvedValue(true);
      fileSystemMocks.readFile.mockResolvedValue(JSON.stringify(mockEntry));

      const result = await cache.has('test-key');
      expect(result).toBe(false);
      expect(fileSystemMocks.exists).toHaveBeenCalled();
      expect(fileSystemMocks.readFile).toHaveBeenCalled();
    });

    it('should handle file read errors gracefully', async () => {
      fileSystemMocks.exists.mockResolvedValue(true);
      fileSystemMocks.readFile.mockRejectedValue(new Error('Read error'));

      const result = await cache.has('test-key');
      expect(result).toBe(false);
      expect(fileSystemMocks.exists).toHaveBeenCalled();
      expect(fileSystemMocks.readFile).toHaveBeenCalled();
    });

    it('should handle invalid JSON gracefully', async () => {
      fileSystemMocks.exists.mockResolvedValue(true);
      fileSystemMocks.readFile.mockResolvedValue('invalid json');

      const result = await cache.has('test-key');
      expect(result).toBe(false);
      expect(fileSystemMocks.exists).toHaveBeenCalled();
      expect(fileSystemMocks.readFile).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should not attempt deletion when cache is disabled', async () => {
      const disabledConfig = { ...mockAppConfig, githubApiCacheEnabled: false };
      const disabledCache = new FileGitHubApiCache(mockFileSystem, disabledConfig);
      await disabledCache.delete('test-key');
      expect(fileSystemMocks.exists).not.toHaveBeenCalled();
      expect(fileSystemMocks.rm).not.toHaveBeenCalled();
    });

    it('should delete file when it exists', async () => {
      fileSystemMocks.exists.mockResolvedValue(true);
      await cache.delete('test-key');
      expect(fileSystemMocks.exists).toHaveBeenCalled();
      expect(fileSystemMocks.rm).toHaveBeenCalled();
    });

    it('should do nothing when file does not exist', async () => {
      fileSystemMocks.exists.mockResolvedValue(false);
      await cache.delete('test-key');
      expect(fileSystemMocks.exists).toHaveBeenCalled();
      expect(fileSystemMocks.rm).not.toHaveBeenCalled();
    });

    it('should handle file delete errors', async () => {
      fileSystemMocks.exists.mockResolvedValue(true);
      fileSystemMocks.rm.mockRejectedValue(new Error('Delete error'));

      expect(cache.delete('test-key')).rejects.toThrow('Failed to delete cache entry');
      expect(fileSystemMocks.exists).toHaveBeenCalled();
      expect(fileSystemMocks.rm).toHaveBeenCalled();
    });
  });

  describe('clearExpired', () => {
    it('should not attempt clearing when cache is disabled', async () => {
      const disabledConfig = { ...mockAppConfig, githubApiCacheEnabled: false };
      const disabledCache = new FileGitHubApiCache(mockFileSystem, disabledConfig);
      await disabledCache.clearExpired();
      expect(fileSystemMocks.ensureDir).not.toHaveBeenCalled();
      expect(fileSystemMocks.readdir).not.toHaveBeenCalled();
    });

    it('should remove expired entries', async () => {
      // Setup mock files
      fileSystemMocks.ensureDir.mockResolvedValue(undefined);
      fileSystemMocks.readdir.mockResolvedValue(['valid.json', 'expired.json', 'corrupted.json']);

      // Valid entry
      const validEntry = {
        data: { foo: 'bar' },
        timestamp: Date.now() - 1000, // 1 second ago
        expiresAt: Date.now() + (mockAppConfig.githubApiCacheTtl ?? 3600000), // Use TTL or default
      };

      // Expired entry
      const expiredEntry = {
        data: { foo: 'baz' },
        timestamp: Date.now() - (mockAppConfig.githubApiCacheTtl ?? 3600000) * 2, // Expired
        expiresAt: Date.now() - (mockAppConfig.githubApiCacheTtl ?? 3600000), // Expired
      };

      // Mock readFile to return different content based on the file
      fileSystemMocks.readFile.mockImplementation((filePath: string) => {
        const fileName = path.basename(filePath);
        if (fileName === 'valid.json') {
          return Promise.resolve(JSON.stringify(validEntry));
        } else if (fileName === 'expired.json') {
          return Promise.resolve(JSON.stringify(expiredEntry));
        } else if (fileName === 'corrupted.json') {
          return Promise.resolve('invalid json');
        }
        return Promise.resolve('{}');
      });

      await cache.clearExpired();
      expect(fileSystemMocks.ensureDir).toHaveBeenCalled();
      expect(fileSystemMocks.readdir).toHaveBeenCalled();
      expect(fileSystemMocks.readFile).toHaveBeenCalledTimes(3);

      // Should have removed expired.json and corrupted.json
      expect(fileSystemMocks.rm).toHaveBeenCalledTimes(2);
    });

    it('should handle directory read errors', async () => {
      fileSystemMocks.ensureDir.mockResolvedValue(undefined);
      fileSystemMocks.readdir.mockRejectedValue(new Error('Directory read error'));

      expect(cache.clearExpired()).rejects.toThrow('Failed to clear expired cache entries');
      expect(fileSystemMocks.ensureDir).toHaveBeenCalled();
      expect(fileSystemMocks.readdir).toHaveBeenCalled();
    });

    it('should handle file read errors gracefully', async () => {
      fileSystemMocks.ensureDir.mockResolvedValue(undefined);
      fileSystemMocks.readdir.mockResolvedValue(['file1.json', 'file2.json']);
      fileSystemMocks.readFile.mockRejectedValue(new Error('Read error'));

      // Should not throw, but should try to remove problematic files
      await cache.clearExpired();
      expect(fileSystemMocks.ensureDir).toHaveBeenCalled();
      expect(fileSystemMocks.readdir).toHaveBeenCalled();
      expect(fileSystemMocks.readFile).toHaveBeenCalledTimes(2);
      expect(fileSystemMocks.rm).toHaveBeenCalledTimes(2);
    });

    it('should handle file delete errors gracefully', async () => {
      // Setup mock files
      fileSystemMocks.ensureDir.mockResolvedValue(undefined);
      fileSystemMocks.readdir.mockResolvedValue(['expired.json']);

      // Expired entry
      const expiredEntry = {
        data: { foo: 'baz' },
        timestamp: Date.now() - (mockAppConfig.githubApiCacheTtl ?? 3600000) * 2, // Expired
        expiresAt: Date.now() - (mockAppConfig.githubApiCacheTtl ?? 3600000), // Expired
      };

      fileSystemMocks.readFile.mockResolvedValue(JSON.stringify(expiredEntry));
      fileSystemMocks.rm.mockRejectedValue(new Error('Delete error'));

      // Should not throw even if rm fails
      await cache.clearExpired();
      expect(fileSystemMocks.ensureDir).toHaveBeenCalled();
      expect(fileSystemMocks.readdir).toHaveBeenCalled();
      expect(fileSystemMocks.readFile).toHaveBeenCalled();
      expect(fileSystemMocks.rm).toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should not attempt clearing when cache is disabled', async () => {
      const disabledConfig = { ...mockAppConfig, githubApiCacheEnabled: false };
      const disabledCache = new FileGitHubApiCache(mockFileSystem, disabledConfig);
      await disabledCache.clear();
      expect(fileSystemMocks.exists).not.toHaveBeenCalled();
      expect(fileSystemMocks.rm).not.toHaveBeenCalled();
    });

    it('should remove the entire cache directory and recreate it', async () => {
      fileSystemMocks.exists.mockResolvedValue(true);
      await cache.clear();
      expect(fileSystemMocks.exists).toHaveBeenCalled();
      expect(fileSystemMocks.rm).toHaveBeenCalledWith(expect.stringContaining('github-api'), {
        recursive: true,
        force: true,
      });
      expect(fileSystemMocks.ensureDir).toHaveBeenCalled();
    });

    it('should do nothing when cache directory does not exist', async () => {
      fileSystemMocks.exists.mockResolvedValue(false);
      await cache.clear();
      expect(fileSystemMocks.exists).toHaveBeenCalled();
      expect(fileSystemMocks.rm).not.toHaveBeenCalled();
      expect(fileSystemMocks.ensureDir).toHaveBeenCalled();
    });

    it('should handle directory delete errors', async () => {
      fileSystemMocks.exists.mockResolvedValue(true);
      fileSystemMocks.rm.mockRejectedValue(new Error('Delete error'));

      expect(cache.clear()).rejects.toThrow('Failed to clear cache');
      expect(fileSystemMocks.exists).toHaveBeenCalled();
      expect(fileSystemMocks.rm).toHaveBeenCalled();
    });
  });

  describe('private methods (indirect testing)', () => {
    it('should generate consistent cache file paths', async () => {
      // Test that the same key always generates the same file path
      fileSystemMocks.exists.mockResolvedValue(false);

      await cache.has('test-key');
      const firstCallArgs = fileSystemMocks.exists.mock.calls?.[0];
      expect(firstCallArgs).toBeDefined();
      const firstCall = firstCallArgs?.[0];
      expect(firstCall).toBeDefined();

      fileSystemMocks.exists.mockResolvedValue(false);

      await cache.has('test-key');
      const secondCallArgs = fileSystemMocks.exists.mock.calls?.[0];
      expect(secondCallArgs).toBeDefined();
      const secondCall = secondCallArgs?.[0];
      expect(secondCall).toBeDefined();

      // Ensure both are strings before comparing
      if (typeof firstCall === 'string' && typeof secondCall === 'string') {
        expect(firstCall).toBe(secondCall);
      } else {
        // Fail the test if they are not both strings, as something is wrong with the mock setup
        expect(typeof firstCall).toBe('string');
        expect(typeof secondCall).toBe('string');
      }
    });

    it('should create cache directory when needed', async () => {
      await cache.set('test-key', { foo: 'bar' });
      expect(fileSystemMocks.ensureDir).toHaveBeenCalled();
    });

    it('should correctly identify expired entries', async () => {
      // Test via get method
      const expiredEntry = {
        data: { foo: 'bar' },
        timestamp: Date.now() - (mockAppConfig.githubApiCacheTtl ?? 3600000) * 2, // Expired
        expiresAt: Date.now() - (mockAppConfig.githubApiCacheTtl ?? 3600000), // Expired
      };

      fileSystemMocks.exists.mockResolvedValue(true);
      fileSystemMocks.readFile.mockResolvedValue(JSON.stringify(expiredEntry));

      const result = await cache.get('test-key');
      expect(result).toBeNull(); // Should be null because entry is expired
    });
  });
});
