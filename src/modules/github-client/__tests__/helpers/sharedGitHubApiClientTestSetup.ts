import { mock } from 'bun:test';
import path from 'node:path';
import type { ICache } from '@modules/cache';
import type { YamlConfig } from '@modules/config';
import type { IDownloader } from '@modules/downloader';
import {
  createMemFileSystem,
  createMockYamlConfig,
  createTestDirectories,
  type PartialYamlConfig,
  TestLogger,
} from '@testing-helpers';
import { GitHubApiClient } from '../../GitHubApiClient';

export const createMockYamlConfigForGitHubApi = async (overrides: PartialYamlConfig = {}): Promise<YamlConfig> => {
  const memFs = await createMemFileSystem();
  const logger = new TestLogger();
  const testDirs = await createTestDirectories(logger, memFs.fs, { testName: 'github-api-client' });

  return createMockYamlConfig({
    config: {
      paths: testDirs.paths,
      ...overrides,
    },
    filePath: path.join(testDirs.paths.dotfilesDir, 'config.yaml'),
    fileSystem: memFs.fs,
    logger,
    systemInfo: { platform: 'linux', arch: 'x64', homeDir: testDirs.paths.homeDir },
    env: {},
  });
};

export const createMockDownloader = (): IDownloader & {
  download: ReturnType<typeof mock<IDownloader['download']>>;
} => {
  const mockDownloadFn = mock<IDownloader['download']>(async () => Buffer.from(''));
  const mockRegisterStrategy = mock<IDownloader['registerStrategy']>(() => {});
  const mockDownloadToFile = mock<IDownloader['downloadToFile']>(async () => {});
  return {
    download: mockDownloadFn,
    registerStrategy: mockRegisterStrategy,
    downloadToFile: mockDownloadToFile,
  };
};

export const createMockGitHubApiCache = (): ICache & {
  get: ReturnType<typeof mock<ICache['get']>>;
  set: ReturnType<typeof mock<ICache['set']>>;
  has: ReturnType<typeof mock<ICache['has']>>;
  delete: ReturnType<typeof mock<ICache['delete']>>;
  clearExpired: ReturnType<typeof mock<ICache['clearExpired']>>;
  clear: ReturnType<typeof mock<ICache['clear']>>;
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
  mockCache: ICache & {
    get: ReturnType<typeof mock<ICache['get']>>;
    set: ReturnType<typeof mock<ICache['set']>>;
    has: ReturnType<typeof mock<ICache['has']>>;
    delete: ReturnType<typeof mock<ICache['delete']>>;
    clearExpired: ReturnType<typeof mock<ICache['clearExpired']>>;
    clear: ReturnType<typeof mock<ICache['clear']>>;
  };
  apiClient: GitHubApiClient;
  logger: TestLogger;
}

export const setupMockGitHubApiClient = async (configOverrides: PartialYamlConfig = {}): Promise<MockSetup> => {
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

  if (
    githubToken !== undefined ||
    githubHost !== undefined ||
    githubClientUserAgent !== undefined ||
    githubApiCacheEnabled !== undefined ||
    githubApiCacheTtl !== undefined
  ) {
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
