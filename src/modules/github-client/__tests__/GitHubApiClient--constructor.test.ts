/**
 * @file generator/src/modules/github-client/__tests__/GitHubApiClient--constructor.test.ts
 * @description Tests for the GitHubApiClient class constructor and basic instantiation.
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { AppConfig } from '../../../types';
import type { IDownloader } from '../../downloader/IDownloader';
import { GitHubApiClient } from '../GitHubApiClient';
import type { IGitHubApiCache } from '../IGitHubApiCache';

// Common variables
let mockDownloadFn: ReturnType<typeof mock<IDownloader['download']>>;
let mockAppConfig: AppConfig;
let apiClient: GitHubApiClient; // For the 'should be defined' test
let mockCacheForConstructorTest: IGitHubApiCache;

describe('GitHubApiClient', () => {
  beforeEach(() => {
    mockDownloadFn = mock<IDownloader['download']>(async () => Buffer.from(''));

    const mockDownloaderInstance: IDownloader = {
      download: mockDownloadFn,
    };

    mockCacheForConstructorTest = {
      get: async <T>(_key: string): Promise<T | null> => null,
      set: async <T>(_key: string, _data: T, _ttlMs?: number): Promise<void> => {},
      has: async (_key: string): Promise<boolean> => false,
      delete: async (_key: string): Promise<void> => {},
      clearExpired: async (): Promise<void> => {},
      clear: async (): Promise<void> => {},
    };

    mockAppConfig = {
      githubToken: undefined,
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
      githubClientUserAgent: 'dotfiles-generator-test/1.0.0',
      githubApiCacheEnabled: true,
      githubApiCacheTtl: 3600000, // 1 hour
    };

    apiClient = new GitHubApiClient(mockAppConfig, mockDownloaderInstance);
  });

  it('should be defined', () => {
    expect(apiClient).toBeDefined();
  });

  // Constructor tests
  describe('constructor', () => {
    it('should initialize correctly without a token', () => {
      const client = new GitHubApiClient(mockAppConfig, { download: mockDownloadFn as any });
      expect(client).toBeInstanceOf(GitHubApiClient);
    });

    it('should initialize correctly with a token', () => {
      const configWithToken: AppConfig = { ...mockAppConfig, githubToken: 'test-token' };
      const client = new GitHubApiClient(configWithToken, { download: mockDownloadFn as any });
      expect(client).toBeInstanceOf(GitHubApiClient);
    });

    it('should initialize correctly with a cache', () => {
      const client = new GitHubApiClient(
        mockAppConfig,
        { download: mockDownloadFn as any },
        mockCacheForConstructorTest
      );
      expect(client).toBeInstanceOf(GitHubApiClient);
    });

    it('should respect cache configuration options', () => {
      const configWithCacheDisabled: AppConfig = {
        ...mockAppConfig,
        githubApiCacheEnabled: false,
      };
      const clientNoCache = new GitHubApiClient(
        configWithCacheDisabled,
        { download: mockDownloadFn as any },
        mockCacheForConstructorTest
      );
      expect(clientNoCache).toBeInstanceOf(GitHubApiClient);

      const configWithCustomTtl: AppConfig = {
        ...mockAppConfig,
        githubApiCacheTtl: 7200000, // 2 hours
      };
      const clientWithCustomTtl = new GitHubApiClient(
        configWithCustomTtl,
        { download: mockDownloadFn as any },
        mockCacheForConstructorTest
      );
      expect(clientWithCustomTtl).toBeInstanceOf(GitHubApiClient);
    });
  });
});
