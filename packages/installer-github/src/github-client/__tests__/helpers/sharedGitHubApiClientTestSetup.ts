import { mock } from 'bun:test';
import path from 'node:path';
import type { YamlConfig } from '@dotfiles/config';
import type { ICache, IDownloader } from '@dotfiles/downloader';
import { createMemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { createMockYamlConfig, createTestDirectories, type PartialYamlConfig } from '@dotfiles/testing-helpers';
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
  setDownload: ReturnType<typeof mock<ICache['setDownload']>>;
  has: ReturnType<typeof mock<ICache['has']>>;
  delete: ReturnType<typeof mock<ICache['delete']>>;
  clearExpired: ReturnType<typeof mock<ICache['clearExpired']>>;
  clear: ReturnType<typeof mock<ICache['clear']>>;
} => {
  return {
    get: mock(async () => null), // Default to cache miss
    set: mock(async () => {}), // Default no-op
    setDownload: mock(async () => {}), // Default no-op
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
    setDownload: ReturnType<typeof mock<ICache['setDownload']>>;
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

// Helper function to check if any GitHub config is provided
function hasGitHubConfig({
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
}): boolean {
  return (
    githubToken !== undefined ||
    githubHost !== undefined ||
    githubClientUserAgent !== undefined ||
    githubApiCacheEnabled !== undefined ||
    githubApiCacheTtl !== undefined
  );
}

// Helper function to set basic GitHub config properties
function setBasicGitHubConfig(
  config: NonNullable<PartialYamlConfig['github']>,
  {
    githubToken,
    githubHost,
    githubClientUserAgent,
  }: {
    githubToken?: string;
    githubHost?: string;
    githubClientUserAgent?: string;
  }
): void {
  if (githubToken !== undefined) {
    config.token = githubToken;
  }
  if (githubHost !== undefined) {
    config.host = githubHost;
  }
  if (githubClientUserAgent !== undefined) {
    config.userAgent = githubClientUserAgent;
  }
}

// Helper function to set GitHub cache config
function setGitHubCacheConfig(
  config: NonNullable<PartialYamlConfig['github']>,
  {
    githubApiCacheEnabled,
    githubApiCacheTtl,
  }: {
    githubApiCacheEnabled?: boolean;
    githubApiCacheTtl?: number;
  }
): void {
  if (githubApiCacheEnabled !== undefined || githubApiCacheTtl !== undefined) {
    config.cache = {
      enabled: true,
      ttl: 3600000,
    };

    if (githubApiCacheEnabled !== undefined) {
      config.cache.enabled = githubApiCacheEnabled;
    }
    if (githubApiCacheTtl !== undefined) {
      config.cache.ttl = githubApiCacheTtl;
    }
  }
}

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

  const params = {
    githubToken,
    githubHost,
    githubClientUserAgent,
    githubApiCacheEnabled,
    githubApiCacheTtl,
  };

  if (hasGitHubConfig(params)) {
    overrides.github = {};
    setBasicGitHubConfig(overrides.github, params);
    setGitHubCacheConfig(overrides.github, params);
  }

  return overrides;
};
