import { mock } from 'bun:test';
import type { YamlConfig } from '@modules/config';
import type { PartialYamlConfig } from '@testing-helpers';
import type { IDownloader } from '@modules/downloader';
import { GitHubApiClient } from '../../GitHubApiClient';
import type { IGitHubApiCache } from '../../IGitHubApiCache';

export const createMockYamlConfig = (overrides: PartialYamlConfig = {}): YamlConfig => {
  const defaultConfig: YamlConfig = {
    paths: {
      dotfilesDir: '/test/dotfiles',
      targetDir: '/usr/bin',
      generatedDir: '/test/dotfiles/.generated',
      toolConfigsDir: '/test/dotfiles/configs/tools',
      completionsDir: '/test/dotfiles/.generated/completions',
      manifestPath: '/test/dotfiles/.generated/manifest.json',
    },
    system: {
      sudoPrompt: 'Please enter your password:',
    },
    logging: {
      debug: '',
    },
    updates: {
      checkOnRun: true,
      checkInterval: 86400000, // 24 hours
    },
    github: {
      token: '', // Empty string instead of undefined
      host: 'https://api.github.com',
      userAgent: 'dotfiles-generator-test/1.0.0',
      cache: {
        enabled: true,
        ttl: 3600000, // 1 hour
      },
    },
    downloader: {
      timeout: 30000,
      retryCount: 3,
      retryDelay: 1000,
      cache: {
        enabled: true,
      },
    },
  };

  // Deep merge the overrides with the default config
  return {
    ...defaultConfig,
    ...overrides,
    // Handle nested objects if they exist in overrides
    paths: { ...defaultConfig.paths, ...(overrides.paths || {}) },
    system: { ...defaultConfig.system, ...(overrides.system || {}) },
    logging: { ...defaultConfig.logging, ...(overrides.logging || {}) },
    updates: { ...defaultConfig.updates, ...(overrides.updates || {}) },
    github: {
      ...defaultConfig.github,
      ...(overrides.github || {}),
      // Handle nested cache object
      cache: {
        ...defaultConfig.github.cache,
        ...(overrides.github?.cache || {})
      }
    },
    downloader: {
      ...defaultConfig.downloader,
      ...(overrides.downloader || {}),
      // Handle nested cache object
      cache: {
        ...defaultConfig.downloader.cache,
        ...(overrides.downloader?.cache || {})
      }
    },
  };
};

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
  mockYamlConfig: YamlConfig;
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

export const setupMockGitHubApiClient = (configOverrides: PartialYamlConfig = {}): MockSetup => {
  const mockYamlConfig = createMockYamlConfig(configOverrides);
  const mockDownloader = createMockDownloader();
  const mockCache = createMockGitHubApiCache();

  const apiClient = new GitHubApiClient(
    mockYamlConfig,
    mockDownloader,
    mockCache
  );

  return {
    mockYamlConfig,
    mockDownloader,
    mockCache,
    apiClient,
  };
};

/**
 * Helper function to create GitHub-specific config overrides
 * for backward compatibility with test files still using the old AppConfig structure
 */
export const createGitHubConfigOverride = ({
  githubToken,
  githubHost,
  githubClientUserAgent,
  githubApiCacheEnabled,
  githubApiCacheTtl,
}: {
  githubToken?: string;
  githubHost?: string;
  githubClientUserAgent?: string;
  githubApiCacheEnabled?: boolean;
  githubApiCacheTtl?: number;
} = {}): PartialYamlConfig => {
  const overrides: PartialYamlConfig = {};
  
  if (githubToken !== undefined || githubHost !== undefined || githubClientUserAgent !== undefined ||
      githubApiCacheEnabled !== undefined || githubApiCacheTtl !== undefined) {
    overrides.github = {};
    
    if (githubToken !== undefined) {
      overrides.github.token = githubToken;
    }
    
    if (githubHost !== undefined) {
      overrides.github.host = githubHost;
    }
    
    if (githubClientUserAgent !== undefined) {
      overrides.github.userAgent = githubClientUserAgent;
    }
    
    if (githubApiCacheEnabled !== undefined || githubApiCacheTtl !== undefined) {
      // Initialize with default values from the schema
      overrides.github.cache = {
        enabled: true,
        ttl: 3600000,
      };
      
      if (githubApiCacheEnabled !== undefined) {
        overrides.github.cache.enabled = githubApiCacheEnabled;
      }
      
      if (githubApiCacheTtl !== undefined) {
        overrides.github.cache.ttl = githubApiCacheTtl;
      }
    }
  }
  
  return overrides;
};
