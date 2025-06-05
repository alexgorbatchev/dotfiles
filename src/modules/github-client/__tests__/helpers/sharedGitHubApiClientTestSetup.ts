/**
 * @file generator/src/modules/github-client/__tests__/helpers/sharedGitHubApiClientTestSetup.ts
 * @description Shared setup utilities for GitHubApiClient tests.
 */

import { mock } from 'bun:test';
import type { AppConfig } from '../../../../types';
import type { IDownloader } from '../../../downloader/IDownloader';
import { GitHubApiClient } from '../../GitHubApiClient';
import type { IGitHubApiCache } from '../../IGitHubApiCache';

export const createMockAppConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
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
  githubApiCacheEnabled: true, // Default to true for most tests
  githubApiCacheTtl: 3600000, // 1 hour
  generatedArtifactsManifestPath: '/test/dotfiles/.generated/generated-manifest.json',
  ...overrides,
});

export const createMockDownloader = (): IDownloader & {
  download: ReturnType<typeof mock<IDownloader['download']>>;
} => {
  const mockDownloadFn = mock<IDownloader['download']>(async () => Buffer.from(''));
  return {
    download: mockDownloadFn,
    // Add other IDownloader methods if they exist and need mocking,
    // though GitHubApiClient only uses 'download'.
  };
};

export const createMockGitHubApiCache = (): IGitHubApiCache & {
  get: ReturnType<typeof mock<IGitHubApiCache['get']>>;
  set: ReturnType<typeof mock<IGitHubApiCache['set']>>;
  has: ReturnType<typeof mock<IGitHubApiCache['has']>>;
  delete: ReturnType<typeof mock<IGitHubApiCache['delete']>>;
  clearExpired: ReturnType<typeof mock<IGitHubApiCache['clearExpired']>>;
  clear: ReturnType<typeof mock<IGitHubApiCache['clear']>>;
} => {
  return {
    get: mock(async () => null), // Default to cache miss
    set: mock(async () => {}), // Default no-op
    has: mock(async () => false),
    delete: mock(async () => {}),
    clearExpired: mock(async () => {}),
    clear: mock(async () => {}),
  };
};

export interface MockSetup {
  mockAppConfig: AppConfig;
  mockDownloader: IDownloader & {
    download: ReturnType<typeof mock<IDownloader['download']>>;
  };
  mockCache: IGitHubApiCache & {
    get: ReturnType<typeof mock<IGitHubApiCache['get']>>;
    set: ReturnType<typeof mock<IGitHubApiCache['set']>>;
    has: ReturnType<typeof mock<IGitHubApiCache['has']>>;
    delete: ReturnType<typeof mock<IGitHubApiCache['delete']>>;
    clearExpired: ReturnType<typeof mock<IGitHubApiCache['clearExpired']>>;
    clear: ReturnType<typeof mock<IGitHubApiCache['clear']>>;
  };
  apiClient: GitHubApiClient;
}

export const setupMockGitHubApiClient = (configOverrides: Partial<AppConfig> = {}): MockSetup => {
  const mockAppConfig = createMockAppConfig(configOverrides);
  const mockDownloader = createMockDownloader();
  const mockCache = createMockGitHubApiCache();

  const apiClient = new GitHubApiClient(
    mockAppConfig,
    mockDownloader, // Pass the whole object
    mockCache
  );

  return {
    mockAppConfig,
    mockDownloader,
    mockCache,
    apiClient,
  };
};
