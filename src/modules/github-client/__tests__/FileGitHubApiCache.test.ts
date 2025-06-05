/**
 * @file generator/src/modules/github-client/__tests__/FileGitHubApiCache.test.ts
 * @description Tests for the FileGitHubApiCache class.
 *
 * ## Development Plan
 *
 * - [x] **Setup Mocks:**
 *   - [x] Mock `IFileSystem` interface using `bun:test`'s `mock`.
 *   - [x] Mock `AppConfig` with required properties.
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

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { FileGitHubApiCache } from '../FileGitHubApiCache';
import type { IFileSystem } from '../../file-system/IFileSystem';
import type { AppConfig } from '../../../types';
import type { CacheEntry } from '../IGitHubApiCache';
import path from 'path';

describe('FileGitHubApiCache', () => {
  let mockFileSystem: IFileSystem;
  let mockAppConfig: AppConfig;
  let cache: FileGitHubApiCache;

  // Mock functions for IFileSystem
  let mockReadFile: ReturnType<typeof mock>;
  let mockWriteFile: ReturnType<typeof mock>;
  let mockExists: ReturnType<typeof mock>;
  let mockMkdir: ReturnType<typeof mock>;
  let mockReaddir: ReturnType<typeof mock>;
  let mockRm: ReturnType<typeof mock>;
  let mockEnsureDir: ReturnType<typeof mock>;

  beforeEach(() => {
    // Create mock functions
    mockReadFile = mock(() => Promise.resolve(''));
    mockWriteFile = mock(() => Promise.resolve());
    mockExists = mock(() => Promise.resolve(false));
    mockMkdir = mock(() => Promise.resolve());
    mockReaddir = mock(() => Promise.resolve([]));
    mockRm = mock(() => Promise.resolve());
    mockEnsureDir = mock(() => Promise.resolve());

    // Create mock file system
    mockFileSystem = {
      readFile: mockReadFile as any,
      writeFile: mockWriteFile as any,
      exists: mockExists as any,
      mkdir: mockMkdir as any,
      readdir: mockReaddir as any,
      rm: mockRm as any,
      ensureDir: mockEnsureDir as any,
      // Add other required methods with empty implementations
      stat: async () => ({ isDirectory: () => true }) as any,
      symlink: async () => {},
      readlink: async () => '',
      chmod: async () => {},
      copyFile: async () => {},
      rename: async () => {},
      rmdir: async () => {},
    };

    // Create mock app config
    mockAppConfig = {
      targetDir: '/usr/bin',
      dotfilesDir: '/test/dotfiles',
      generatedDir: '/test/dotfiles/.generated',
      toolConfigDir: '/test/dotfiles/generator/src/tools',
      debug: '',
      cacheEnabled: true,
      cacheDir: '/test/dotfiles/.generated/cache',
      binariesDir: '/test/dotfiles/.generated/binaries',
      binDir: '/test/dotfiles/.generated/bin',
      zshInitDir: '/test/dotfiles/.generated/zsh',
      manifestPath: '/test/dotfiles/.generated/manifest.json',
      completionsDir: '/test/dotfiles/.generated/completions',
      githubApiCacheEnabled: true,
      githubApiCacheTtl: 3600000, // 1 hour
      generatedArtifactsManifestPath: '/test/dotfiles/.generated/generated-manifest.json',
    };

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
      expect(mockExists).not.toHaveBeenCalled();
    });

    it('should return null when file does not exist', async () => {
      mockExists.mockResolvedValue(false);
      const result = await cache.get('test-key');
      expect(result).toBeNull();
      expect(mockExists).toHaveBeenCalled();
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('should return cached data when file exists and is not expired', async () => {
      const mockData = { foo: 'bar' };
      const mockEntry: CacheEntry<typeof mockData> = {
        data: mockData,
        timestamp: Date.now() - 1000, // 1 second ago
        expiresAt: Date.now() + 3600000, // 1 hour from now
      };

      mockExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify(mockEntry));

      const result = await cache.get<typeof mockData>('test-key');
      expect(result).toEqual(mockData);
      expect(mockExists).toHaveBeenCalled();
      expect(mockReadFile).toHaveBeenCalled();
    });

    it('should return null and delete file when entry is expired', async () => {
      const mockData = { foo: 'bar' };
      const mockEntry: CacheEntry<typeof mockData> = {
        data: mockData,
        timestamp: Date.now() - 7200000, // 2 hours ago
        expiresAt: Date.now() - 3600000, // 1 hour ago (expired)
      };

      mockExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify(mockEntry));

      const result = await cache.get<typeof mockData>('test-key');
      expect(result).toBeNull();
      expect(mockExists).toHaveBeenCalled();
      expect(mockReadFile).toHaveBeenCalled();
      expect(mockRm).toHaveBeenCalled();
    });

    it('should handle file read errors gracefully', async () => {
      mockExists.mockResolvedValue(true);
      mockReadFile.mockRejectedValue(new Error('Read error'));

      const result = await cache.get('test-key');
      expect(result).toBeNull();
      expect(mockExists).toHaveBeenCalled();
      expect(mockReadFile).toHaveBeenCalled();
    });

    it('should handle invalid JSON gracefully', async () => {
      mockExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue('invalid json');

      const result = await cache.get('test-key');
      expect(result).toBeNull();
      expect(mockExists).toHaveBeenCalled();
      expect(mockReadFile).toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('should not cache data when cache is disabled', async () => {
      const disabledConfig = { ...mockAppConfig, githubApiCacheEnabled: false };
      const disabledCache = new FileGitHubApiCache(mockFileSystem, disabledConfig);
      await disabledCache.set('test-key', { foo: 'bar' });
      expect(mockEnsureDir).not.toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should cache data with default TTL', async () => {
      const data = { foo: 'bar' };
      await cache.set('test-key', data);
      expect(mockEnsureDir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalled();

      // Verify the written data contains the expected fields
      const writeCall = mockWriteFile.mock.calls?.[0];
      const writtenContent = writeCall?.[1];
      const parsedContent = JSON.parse(writtenContent);
      expect(parsedContent).toHaveProperty('data', data);
      expect(parsedContent).toHaveProperty('timestamp');
      expect(parsedContent).toHaveProperty('expiresAt');

      // Verify TTL is default (1 hour)
      expect(parsedContent.expiresAt - parsedContent.timestamp).toBe(3600000);
    });

    it('should cache data with custom TTL', async () => {
      const data = { foo: 'bar' };
      const customTtl = 7200000; // 2 hours
      await cache.set('test-key', data, customTtl);
      expect(mockEnsureDir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalled();

      // Verify the written data contains the expected fields
      const writeCall = mockWriteFile.mock.calls?.[0];
      const writtenContent = writeCall?.[1];
      const parsedContent = JSON.parse(writtenContent);
      expect(parsedContent).toHaveProperty('data', data);
      expect(parsedContent).toHaveProperty('timestamp');
      expect(parsedContent).toHaveProperty('expiresAt');

      // Verify TTL is custom (2 hours)
      expect(parsedContent.expiresAt - parsedContent.timestamp).toBe(customTtl);
    });

    it('should handle file write errors', async () => {
      mockEnsureDir.mockResolvedValue(undefined);
      mockWriteFile.mockRejectedValue(new Error('Write error'));

      await expect(cache.set('test-key', { foo: 'bar' })).rejects.toThrow('Failed to cache data');
      expect(mockEnsureDir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('should handle directory creation errors', async () => {
      mockEnsureDir.mockRejectedValue(new Error('Directory creation error'));

      await expect(cache.set('test-key', { foo: 'bar' })).rejects.toThrow('Failed to cache data');
      expect(mockEnsureDir).toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
    });
  });

  describe('has', () => {
    it('should return false when cache is disabled', async () => {
      const disabledConfig = { ...mockAppConfig, githubApiCacheEnabled: false };
      const disabledCache = new FileGitHubApiCache(mockFileSystem, disabledConfig);
      const result = await disabledCache.has('test-key');
      expect(result).toBe(false);
      expect(mockExists).not.toHaveBeenCalled();
    });

    it('should return false when file does not exist', async () => {
      mockExists.mockResolvedValue(false);
      const result = await cache.has('test-key');
      expect(result).toBe(false);
      expect(mockExists).toHaveBeenCalled();
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('should return true when file exists and is not expired', async () => {
      const mockEntry = {
        data: { foo: 'bar' },
        timestamp: Date.now() - 1000, // 1 second ago
        expiresAt: Date.now() + 3600000, // 1 hour from now
      };

      mockExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify(mockEntry));

      const result = await cache.has('test-key');
      expect(result).toBe(true);
      expect(mockExists).toHaveBeenCalled();
      expect(mockReadFile).toHaveBeenCalled();
    });

    it('should return false when file exists but is expired', async () => {
      const mockEntry = {
        data: { foo: 'bar' },
        timestamp: Date.now() - 7200000, // 2 hours ago
        expiresAt: Date.now() - 3600000, // 1 hour ago (expired)
      };

      mockExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify(mockEntry));

      const result = await cache.has('test-key');
      expect(result).toBe(false);
      expect(mockExists).toHaveBeenCalled();
      expect(mockReadFile).toHaveBeenCalled();
    });

    it('should handle file read errors gracefully', async () => {
      mockExists.mockResolvedValue(true);
      mockReadFile.mockRejectedValue(new Error('Read error'));

      const result = await cache.has('test-key');
      expect(result).toBe(false);
      expect(mockExists).toHaveBeenCalled();
      expect(mockReadFile).toHaveBeenCalled();
    });

    it('should handle invalid JSON gracefully', async () => {
      mockExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue('invalid json');

      const result = await cache.has('test-key');
      expect(result).toBe(false);
      expect(mockExists).toHaveBeenCalled();
      expect(mockReadFile).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should not attempt deletion when cache is disabled', async () => {
      const disabledConfig = { ...mockAppConfig, githubApiCacheEnabled: false };
      const disabledCache = new FileGitHubApiCache(mockFileSystem, disabledConfig);
      await disabledCache.delete('test-key');
      expect(mockExists).not.toHaveBeenCalled();
      expect(mockRm).not.toHaveBeenCalled();
    });

    it('should delete file when it exists', async () => {
      mockExists.mockResolvedValue(true);
      await cache.delete('test-key');
      expect(mockExists).toHaveBeenCalled();
      expect(mockRm).toHaveBeenCalled();
    });

    it('should do nothing when file does not exist', async () => {
      mockExists.mockResolvedValue(false);
      await cache.delete('test-key');
      expect(mockExists).toHaveBeenCalled();
      expect(mockRm).not.toHaveBeenCalled();
    });

    it('should handle file delete errors', async () => {
      mockExists.mockResolvedValue(true);
      mockRm.mockRejectedValue(new Error('Delete error'));

      await expect(cache.delete('test-key')).rejects.toThrow('Failed to delete cache entry');
      expect(mockExists).toHaveBeenCalled();
      expect(mockRm).toHaveBeenCalled();
    });
  });

  describe('clearExpired', () => {
    it('should not attempt clearing when cache is disabled', async () => {
      const disabledConfig = { ...mockAppConfig, githubApiCacheEnabled: false };
      const disabledCache = new FileGitHubApiCache(mockFileSystem, disabledConfig);
      await disabledCache.clearExpired();
      expect(mockEnsureDir).not.toHaveBeenCalled();
      expect(mockReaddir).not.toHaveBeenCalled();
    });

    it('should remove expired entries', async () => {
      // Setup mock files
      mockEnsureDir.mockResolvedValue(undefined);
      mockReaddir.mockResolvedValue(['valid.json', 'expired.json', 'corrupted.json']);

      // Valid entry
      const validEntry = {
        data: { foo: 'bar' },
        timestamp: Date.now() - 1000, // 1 second ago
        expiresAt: Date.now() + 3600000, // 1 hour from now
      };

      // Expired entry
      const expiredEntry = {
        data: { foo: 'baz' },
        timestamp: Date.now() - 7200000, // 2 hours ago
        expiresAt: Date.now() - 3600000, // 1 hour ago (expired)
      };

      // Mock readFile to return different content based on the file
      mockReadFile.mockImplementation((filePath: string) => {
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
      expect(mockEnsureDir).toHaveBeenCalled();
      expect(mockReaddir).toHaveBeenCalled();
      expect(mockReadFile).toHaveBeenCalledTimes(3);

      // Should have removed expired.json and corrupted.json
      expect(mockRm).toHaveBeenCalledTimes(2);
    });

    it('should handle directory read errors', async () => {
      mockEnsureDir.mockResolvedValue(undefined);
      mockReaddir.mockRejectedValue(new Error('Directory read error'));

      await expect(cache.clearExpired()).rejects.toThrow('Failed to clear expired cache entries');
      expect(mockEnsureDir).toHaveBeenCalled();
      expect(mockReaddir).toHaveBeenCalled();
    });

    it('should handle file read errors gracefully', async () => {
      mockEnsureDir.mockResolvedValue(undefined);
      mockReaddir.mockResolvedValue(['file1.json', 'file2.json']);
      mockReadFile.mockRejectedValue(new Error('Read error'));

      // Should not throw, but should try to remove problematic files
      await cache.clearExpired();
      expect(mockEnsureDir).toHaveBeenCalled();
      expect(mockReaddir).toHaveBeenCalled();
      expect(mockReadFile).toHaveBeenCalledTimes(2);
      expect(mockRm).toHaveBeenCalledTimes(2);
    });

    it('should handle file delete errors gracefully', async () => {
      // Setup mock files
      mockEnsureDir.mockResolvedValue(undefined);
      mockReaddir.mockResolvedValue(['expired.json']);

      // Expired entry
      const expiredEntry = {
        data: { foo: 'baz' },
        timestamp: Date.now() - 7200000, // 2 hours ago
        expiresAt: Date.now() - 3600000, // 1 hour ago (expired)
      };

      mockReadFile.mockResolvedValue(JSON.stringify(expiredEntry));
      mockRm.mockRejectedValue(new Error('Delete error'));

      // Should not throw even if rm fails
      await cache.clearExpired();
      expect(mockEnsureDir).toHaveBeenCalled();
      expect(mockReaddir).toHaveBeenCalled();
      expect(mockReadFile).toHaveBeenCalled();
      expect(mockRm).toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should not attempt clearing when cache is disabled', async () => {
      const disabledConfig = { ...mockAppConfig, githubApiCacheEnabled: false };
      const disabledCache = new FileGitHubApiCache(mockFileSystem, disabledConfig);
      await disabledCache.clear();
      expect(mockExists).not.toHaveBeenCalled();
      expect(mockRm).not.toHaveBeenCalled();
    });

    it('should remove the entire cache directory and recreate it', async () => {
      mockExists.mockResolvedValue(true);
      await cache.clear();
      expect(mockExists).toHaveBeenCalled();
      expect(mockRm).toHaveBeenCalledWith(expect.stringContaining('github-api'), {
        recursive: true,
        force: true,
      });
      expect(mockEnsureDir).toHaveBeenCalled();
    });

    it('should do nothing when cache directory does not exist', async () => {
      mockExists.mockResolvedValue(false);
      await cache.clear();
      expect(mockExists).toHaveBeenCalled();
      expect(mockRm).not.toHaveBeenCalled();
      expect(mockEnsureDir).toHaveBeenCalled();
    });

    it('should handle directory delete errors', async () => {
      mockExists.mockResolvedValue(true);
      mockRm.mockRejectedValue(new Error('Delete error'));

      await expect(cache.clear()).rejects.toThrow('Failed to clear cache');
      expect(mockExists).toHaveBeenCalled();
      expect(mockRm).toHaveBeenCalled();
    });
  });

  describe('private methods (indirect testing)', () => {
    it('should generate consistent cache file paths', async () => {
      // Test that the same key always generates the same file path
      mockExists.mockResolvedValue(false);

      await cache.has('test-key');
      const firstCall = mockExists.mock.calls?.[0]?.[0];

      mockExists.mockReset();
      mockExists.mockResolvedValue(false);

      await cache.has('test-key');
      const secondCall = mockExists.mock.calls?.[0]?.[0];

      expect(firstCall).toBe(secondCall);
    });

    it('should create cache directory when needed', async () => {
      await cache.set('test-key', { foo: 'bar' });
      expect(mockEnsureDir).toHaveBeenCalled();
    });

    it('should correctly identify expired entries', async () => {
      // Test via get method
      const expiredEntry = {
        data: { foo: 'bar' },
        timestamp: Date.now() - 7200000, // 2 hours ago
        expiresAt: Date.now() - 3600000, // 1 hour ago (expired)
      };

      mockExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify(expiredEntry));

      const result = await cache.get('test-key');
      expect(result).toBeNull(); // Should be null because entry is expired
    });
  });
});
