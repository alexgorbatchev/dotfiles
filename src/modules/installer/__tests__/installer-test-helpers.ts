import { mock } from 'bun:test';
import path from 'node:path';
import type { YamlConfig } from '@modules/config';
import type { IDownloader } from '@modules/downloader';
import type { IArchiveExtractor } from '@modules/extractor';
import type { IFileSystem } from '@modules/file-system';
import type { IGitHubApiClient } from '@modules/github-client';
import {
  createMemFileSystem,
  createMockYamlConfig,
  createTestDirectories,
  type TestDirectories,
  TestLogger,
} from '@testing-helpers';
import type {
  BaseInstallContext,
  BrewToolConfig,
  CurlScriptToolConfig,
  ExtractResult,
  GitHubRelease,
  GithubReleaseToolConfig,
  ManualToolConfig,
} from '@types';
import type { ILogObj } from 'tslog';
import { Installer } from '../Installer';

// Common test data
export const MOCK_TOOL_NAME = 'test-tool';
export const MOCK_TOOL_REPO = 'owner/repo';
export const MOCK_TOOL_VERSION = '1.0.0';

export const MOCK_GITHUB_RELEASE: GitHubRelease = {
  id: 123,
  tag_name: MOCK_TOOL_VERSION,
  name: 'Test Release',
  draft: false,
  prerelease: false,
  created_at: '2023-01-01T00:00:00Z',
  published_at: '2023-01-01T00:00:00Z',
  assets: [
    {
      name: 'test-tool-linux-amd64',
      browser_download_url: 'https://example.com/test-tool-linux-amd64',
      size: 1000,
      content_type: 'application/octet-stream',
      state: 'uploaded',
      download_count: 100,
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z',
    },
  ],
  html_url: 'https://github.com/owner/repo/releases/tag/1.0.0',
};

export const MOCK_GITHUB_RELEASE_WITH_MULTIPLE_ASSETS: GitHubRelease = {
  ...MOCK_GITHUB_RELEASE,
  assets: [
    {
      name: 'test-tool-linux-amd64',
      browser_download_url: 'https://example.com/test-tool-linux-amd64',
      size: 1000,
      content_type: 'application/octet-stream',
      state: 'uploaded',
      download_count: 100,
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z',
    },
    {
      name: 'test-tool-darwin-arm64.zip',
      browser_download_url: 'https://example.com/test-tool-darwin-arm64.zip',
      size: 1200,
      content_type: 'application/zip',
      state: 'uploaded',
      download_count: 50,
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z',
    },
    {
      name: 'test-tool-windows-x64.exe',
      browser_download_url: 'https://example.com/test-tool-windows-x64.exe',
      size: 1500,
      content_type: 'application/octet-stream',
      state: 'uploaded',
      download_count: 75,
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z',
    },
  ],
};

// Test setup interface
export interface InstallerTestSetup {
  logger: TestLogger<ILogObj>;
  mockFileSystem: IFileSystem;
  mockDownloader: IDownloader;
  mockGitHubApiClient: IGitHubApiClient;
  mockArchiveExtractor: IArchiveExtractor;
  mockAppConfig: YamlConfig;
  installer: Installer;
  fileSystemMocks: Awaited<ReturnType<typeof createMemFileSystem>>['spies'];
  testDirs: TestDirectories;
  mockToolBinaryPath: string;

  // Individual mocks for fine-grained control
  mocks: {
    download: ReturnType<typeof mock>;
    getLatestRelease: ReturnType<typeof mock>;
    getReleaseByTag: ReturnType<typeof mock>;
    extract: ReturnType<typeof mock>;
  };
}

/**
 * Creates a full installer test setup with all mocks and dependencies
 */
export async function createInstallerTestSetup(): Promise<InstallerTestSetup> {
  const logger = new TestLogger();
  const { fs, spies } = await createMemFileSystem();
  const testDirs = await createTestDirectories(logger, fs, { testName: 'installer-tests' });

  const mockToolBinaryPath = path.join(testDirs.paths.binariesDir, MOCK_TOOL_NAME, MOCK_TOOL_NAME);

  // Setup mock downloader
  const mockDownload = mock(() => Promise.resolve(Buffer.from('mock data')));
  const mockDownloader: IDownloader = {
    download: mockDownload,
    registerStrategy: mock(() => {}),
    downloadToFile: mock(() => Promise.resolve()),
  };

  // Setup mock GitHub API client
  const mockGetLatestRelease = mock(() => Promise.resolve(MOCK_GITHUB_RELEASE));
  const mockGetReleaseByTag = mock(() => Promise.resolve(MOCK_GITHUB_RELEASE));
  const mockGitHubApiClient: IGitHubApiClient = {
    getLatestRelease: mockGetLatestRelease,
    getReleaseByTag: mockGetReleaseByTag,
    getAllReleases: mock(() => Promise.resolve([MOCK_GITHUB_RELEASE])),
    getReleaseByConstraint: mock(() => Promise.resolve(MOCK_GITHUB_RELEASE)),
    getRateLimit: mock(() => Promise.resolve({ limit: 5000, remaining: 4999, reset: 0, used: 1, resource: 'core' })),
  };

  // Setup mock ArchiveExtractor
  const mockExtract = mock(
    (): Promise<ExtractResult> =>
      Promise.resolve({
        extractedFiles: ['test-tool-linux-amd64'],
        executables: ['test-tool-linux-amd64'],
      })
  );
  const mockArchiveExtractor: IArchiveExtractor = {
    extract: mockExtract,
    detectFormat: mock(async () => 'tar.gz' as const),
    isSupported: mock(() => true),
  };

  // Setup mock app config
  const mockAppConfig = await createMockYamlConfig({
    config: {
      paths: testDirs.paths,
    },
    filePath: path.join(testDirs.paths.dotfilesDir, 'config.yaml'),
    fileSystem: fs,
    logger,
    systemInfo: { platform: 'linux', arch: 'x64', release: 'test', homeDir: testDirs.paths.homeDir },
    env: {},
  });

  // Create installer instance
  const installer = new Installer(logger, fs, mockDownloader, mockGitHubApiClient, mockArchiveExtractor, mockAppConfig);

  return {
    logger,
    mockFileSystem: fs,
    mockDownloader,
    mockGitHubApiClient,
    mockArchiveExtractor,
    mockAppConfig,
    installer,
    fileSystemMocks: spies,
    testDirs,
    mockToolBinaryPath,
    mocks: {
      download: mockDownload,
      getLatestRelease: mockGetLatestRelease,
      getReleaseByTag: mockGetReleaseByTag,
      extract: mockExtract,
    },
  };
}

/**
 * Creates a GitHub release tool config for testing
 */
export function createGithubReleaseToolConfig(
  overrides: Partial<GithubReleaseToolConfig> = {}
): GithubReleaseToolConfig {
  const baseConfig: GithubReleaseToolConfig = {
    name: MOCK_TOOL_NAME,
    binaries: [MOCK_TOOL_NAME],
    version: MOCK_TOOL_VERSION,
    installationMethod: 'github-release',
    installParams: {
      repo: MOCK_TOOL_REPO,
    },
    ...overrides,
  };

  return baseConfig;
}

/**
 * Creates a brew tool config for testing
 */
export function createBrewToolConfig(overrides: Partial<BrewToolConfig> = {}): BrewToolConfig {
  const baseConfig: BrewToolConfig = {
    name: MOCK_TOOL_NAME,
    binaries: [MOCK_TOOL_NAME],
    version: MOCK_TOOL_VERSION,
    installationMethod: 'brew',
    installParams: {
      formula: MOCK_TOOL_NAME,
    },
    ...overrides,
  };

  return baseConfig;
}

/**
 * Creates a curl script tool config for testing
 */
export function createCurlScriptToolConfig(overrides: Partial<CurlScriptToolConfig> = {}): CurlScriptToolConfig {
  const baseConfig: CurlScriptToolConfig = {
    name: MOCK_TOOL_NAME,
    binaries: [MOCK_TOOL_NAME],
    version: MOCK_TOOL_VERSION,
    installationMethod: 'curl-script',
    installParams: {
      url: 'https://example.com/install.sh',
      shell: 'bash',
    },
    ...overrides,
  };

  return baseConfig;
}

/**
 * Creates a manual tool config for testing
 */
export function createManualToolConfig(overrides: Partial<ManualToolConfig> = {}): ManualToolConfig {
  const baseConfig: ManualToolConfig = {
    name: MOCK_TOOL_NAME,
    binaries: [MOCK_TOOL_NAME],
    version: MOCK_TOOL_VERSION,
    installationMethod: 'manual',
    installParams: {
      binaryPath: `/usr/local/bin/${MOCK_TOOL_NAME}`,
    },
    ...overrides,
  };

  return baseConfig;
}

/**
 * Creates a test context for installation
 */
export function createTestContext(
  setup: InstallerTestSetup,
  overrides: Partial<BaseInstallContext> = {}
): BaseInstallContext {
  return {
    toolName: MOCK_TOOL_NAME,
    installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME),
    systemInfo: { platform: 'linux', arch: 'x64', release: '', homeDir: setup.testDirs.paths.homeDir },
    toolConfig: createGithubReleaseToolConfig(),
    appConfig: setup.mockAppConfig,
    ...overrides,
  };
}

/**
 * Helper to setup filesystem mocks for common operations
 */
export function setupFileSystemMocks(setup: InstallerTestSetup): void {
  setup.fileSystemMocks.chmod.mockResolvedValue(undefined);
  setup.fileSystemMocks.symlink.mockResolvedValue(undefined);
  setup.fileSystemMocks.copyFile.mockResolvedValue(undefined);
  setup.fileSystemMocks.rm.mockResolvedValue(undefined);
}
