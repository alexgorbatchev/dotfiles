import type { ProjectConfig } from "@dotfiles/config";
import { Architecture, Platform } from "@dotfiles/core";
import type { ICache, IDownloader } from "@dotfiles/downloader";
import { createMemFileSystem } from "@dotfiles/file-system";
import { TestLogger } from "@dotfiles/logger";
import { createMockProjectConfig, createTestDirectories, type PartialProjectConfig } from "@dotfiles/testing-helpers";
import { mock } from "bun:test";
import path from "node:path";
import { GitHubApiClient } from "../../GitHubApiClient";

interface IMockDownloader extends IDownloader {
  download: ReturnType<typeof mock<IDownloader["download"]>>;
}

interface IMockCache extends ICache {
  get: ReturnType<typeof mock<ICache["get"]>>;
  set: ReturnType<typeof mock<ICache["set"]>>;
  setDownload: ReturnType<typeof mock<ICache["setDownload"]>>;
  has: ReturnType<typeof mock<ICache["has"]>>;
  delete: ReturnType<typeof mock<ICache["delete"]>>;
  clearExpired: ReturnType<typeof mock<ICache["clearExpired"]>>;
  clear: ReturnType<typeof mock<ICache["clear"]>>;
}

interface IGitHubConfigOverrideArgs {
  githubToken?: string;
  githubHost?: string;
  githubClientUserAgent?: string;
  githubApiCacheEnabled?: boolean;
  githubApiCacheTtl?: number;
}

interface IBasicGitHubConfigArgs {
  githubToken?: string;
  githubHost?: string;
  githubClientUserAgent?: string;
}

interface IGitHubCacheConfigArgs {
  githubApiCacheEnabled?: boolean;
  githubApiCacheTtl?: number;
}

export const createMockProjectConfigForGitHubApi = async (
  overrides: PartialProjectConfig = {},
): Promise<ProjectConfig> => {
  const memFs = await createMemFileSystem();
  const logger = new TestLogger();
  const testDirs = await createTestDirectories(logger, memFs.fs, { testName: "github-api-client" });

  return createMockProjectConfig({
    config: {
      paths: testDirs.paths,
      ...overrides,
    },
    filePath: path.join(testDirs.paths.dotfilesDir, "dotfiles.config.ts"),
    fileSystem: memFs.fs,
    logger,
    systemInfo: {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
      homeDir: testDirs.paths.homeDir,
      hostname: "test-host",
    },
    env: {},
  });
};

export const createMockDownloader = (): IMockDownloader => {
  const mockDownloadFn = mock<IDownloader["download"]>(async () => Buffer.from(""));
  const mockRegisterStrategy = mock<IDownloader["registerStrategy"]>(() => {});
  const mockDownloadToFile = mock<IDownloader["downloadToFile"]>(async () => {});
  return {
    download: mockDownloadFn,
    registerStrategy: mockRegisterStrategy,
    downloadToFile: mockDownloadToFile,
  };
};

export const createMockGitHubApiCache = (): IMockCache => {
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

export interface IMockSetup {
  mockProjectConfig: ProjectConfig;
  mockDownloader: IMockDownloader;
  mockCache: IMockCache;
  apiClient: GitHubApiClient;
  logger: TestLogger;
}

export const setupMockGitHubApiClient = async (configOverrides: PartialProjectConfig = {}): Promise<IMockSetup> => {
  const mockProjectConfig = await createMockProjectConfigForGitHubApi(configOverrides);
  const mockDownloader = createMockDownloader();
  const mockCache = createMockGitHubApiCache();
  const logger = new TestLogger();

  const apiClient = new GitHubApiClient(logger, mockProjectConfig, mockDownloader, mockCache);

  return {
    mockProjectConfig,
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
}: IGitHubConfigOverrideArgs): boolean {
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
  config: NonNullable<PartialProjectConfig["github"]>,
  { githubToken, githubHost, githubClientUserAgent }: IBasicGitHubConfigArgs,
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
  config: NonNullable<PartialProjectConfig["github"]>,
  { githubApiCacheEnabled, githubApiCacheTtl }: IGitHubCacheConfigArgs,
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
 */
export const createGitHubConfigOverride = ({
  githubToken,
  githubHost,
  githubClientUserAgent,
  githubApiCacheEnabled,
  githubApiCacheTtl,
}: IGitHubConfigOverrideArgs = {}): PartialProjectConfig => {
  const overrides: PartialProjectConfig = {};

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
