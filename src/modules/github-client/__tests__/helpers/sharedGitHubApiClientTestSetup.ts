import { mock } from 'bun:test';
import type { YamlConfig } from '@modules/config';
import {
  createMemFileSystem,
  type PartialYamlConfig,
  TestLogger,
} from '@testing-helpers';
import type { IDownloader } from '@modules/downloader';
import { GitHubApiClient } from '../../GitHubApiClient';
import type { IGitHubApiCache } from '../../IGitHubApiCache';
import { createYamlConfigFromObject, } from '../../../config-loader';

export const createMockYamlConfigForGitHubApi = async (overrides: PartialYamlConfig = {}): Promise<YamlConfig> => {
  const memFs = await createMemFileSystem();
  const logger = new TestLogger();
  return createYamlConfigFromObject(logger, memFs.fs, overrides);
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
  logger: TestLogger;
}

export const setupMockGitHubApiClient = async (
  configOverrides: PartialYamlConfig = {},
): Promise<MockSetup> => {
  const mockYamlConfig = await createMockYamlConfigForGitHubApi(configOverrides);
  const mockDownloader = createMockDownloader();
  const mockCache = createMockGitHubApiCache();
  const logger = new TestLogger();

  const apiClient = new GitHubApiClient(logger, mockYamlConfig, mockDownloader, mockCache);

  return {
    mockYamlConfig,
    mockDownloader,
    mockCache,
    apiClient,
    logger,
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
