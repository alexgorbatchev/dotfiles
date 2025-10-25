import { mock } from 'bun:test';
import path from 'node:path';
import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { YamlConfig } from '@dotfiles/config';
import type { IDownloader } from '@dotfiles/downloader';
import { createMemFileSystem, type IFileSystem } from '@dotfiles/file-system';
import type { IGitHubApiClient } from '@dotfiles/installer/clients/github';
import { TestLogger, type TsLogger } from '@dotfiles/logger';
import type {
  BaseInstallContext,
  BrewToolConfig,
  CargoToolConfig,
  CurlScriptToolConfig,
  ExtractResult,
  GitHubRelease,
  GithubReleaseToolConfig,
  ManualToolConfig,
} from '@dotfiles/schemas';
import {
  createMock$,
  createMockYamlConfig,
  createTestDirectories,
  type TestDirectories,
} from '@dotfiles/testing-helpers';
import type { ILogObj } from 'tslog';
import { Installer } from '../Installer';
import type { HookExecutor } from '../utils/HookExecutor';

// Common test data
export const MOCK_TOOL_NAME = 'test-tool';
export const MOCK_TOOL_REPO = 'owner/repo';

export function createMockCargoClient() {
  return {
    getCrateMetadata: mock(),
    buildCargoTomlUrl: mock(),
    getCargoTomlPackage: mock(),
    getLatestVersion: mock(),
  };
}

export function createMockToolInstallationRegistry() {
  return {
    recordToolInstallation: mock(async () => {}),
    getToolInstallation: mock(),
    getAllToolInstallations: mock(async () => []),
    updateToolInstallation: mock(async () => {}),
    removeToolInstallation: mock(async () => {}),
    isToolInstalled: mock(async () => false),
    close: mock(async () => {}),
  };
}
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

export const MOCK_GITHUB_RELEASE_WITH_VARIANTS: GitHubRelease = {
  ...MOCK_GITHUB_RELEASE,
  assets: [
    {
      name: 'test-tool-linux-x86_64-musl.tar.gz',
      browser_download_url: 'https://example.com/test-tool-linux-x86_64-musl.tar.gz',
      size: 1000,
      content_type: 'application/gzip',
      state: 'uploaded',
      download_count: 100,
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z',
    },
    {
      name: 'test-tool-linux-x86_64-gnu.tar.gz',
      browser_download_url: 'https://example.com/test-tool-linux-x86_64-gnu.tar.gz',
      size: 1100,
      content_type: 'application/gzip',
      state: 'uploaded',
      download_count: 150,
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
  ],
};

// Test setup interface
export interface InstallerTestSetup {
  logger: TestLogger<ILogObj>;
  fs: IFileSystem;
  mockDownloader: IDownloader;
  mockGitHubApiClient: IGitHubApiClient;
  mockCargoClient: ReturnType<typeof createMockCargoClient>;
  mockArchiveExtractor: IArchiveExtractor;
  mockAppConfig: YamlConfig;
  mockToolInstallationRegistry: ReturnType<typeof createMockToolInstallationRegistry>;
  installer: Installer;
  fileSystemMocks: Awaited<ReturnType<typeof createMemFileSystem>>['spies'];
  testDirs: TestDirectories;
  mockToolBinaryPath: string;

  // Individual mocks for fine-grained control
  mocks: {
    downloader: IDownloader;
    download: ReturnType<typeof mock>;
    getLatestRelease: ReturnType<typeof mock>;
    getReleaseByTag: ReturnType<typeof mock>;
    extract: ReturnType<typeof mock>;
    archiveExtractor: IArchiveExtractor;
    hookExecutor: HookExecutor;
    cargoClient: ReturnType<typeof createMockCargoClient>;
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
  const mockDownload = mock(async (_url: string, options?: { destinationPath?: string }) => {
    // Create the file in the mock filesystem if destinationPath is provided
    if (options?.destinationPath) {
      await fs.ensureDir(path.dirname(options.destinationPath));
      await fs.writeFile(options.destinationPath, 'mock binary content');
    }
    return Promise.resolve(Buffer.from('mock data'));
  });
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

  // Setup mock CargoClient
  const mockCargoClient = createMockCargoClient();

  // Setup mock ArchiveExtractor
  const mockExtract = mock(async (_archivePath: string, options?: { targetDir?: string }): Promise<ExtractResult> => {
    // Create the extracted files in the target directory
    if (options?.targetDir) {
      await fs.ensureDir(options.targetDir);
      // Create both the specific tool name and a generic 'tool' file for hooks to use
      await fs.writeFile(path.join(options.targetDir, MOCK_TOOL_NAME), 'mock-binary-content');
      await fs.writeFile(path.join(options.targetDir, 'tool'), 'mock-binary-content');
      await fs.writeFile(path.join(options.targetDir, 'README.md'), 'mock-readme');
      await fs.writeFile(path.join(options.targetDir, 'LICENSE'), 'mock-license');
      await fs.writeFile(path.join(options.targetDir, 'Makefile'), 'CC=gcc\nall:\n\tgcc -o tool tool.c');
    }
    return {
      extractedFiles: [MOCK_TOOL_NAME, 'tool', 'README.md', 'LICENSE', 'Makefile'],
      executables: [MOCK_TOOL_NAME, 'tool'],
    };
  });
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
    systemInfo: { platform: 'linux', arch: 'x64', homeDir: testDirs.paths.homeDir },
    env: {},
  });

  // Setup mock HookExecutor
  const mockExecuteHook = mock(async () => ({ success: true, durationMs: 100, skipped: false }));
  const mockCreateEnhancedContext = mock(
    (baseContext: BaseInstallContext, fileSystem: IFileSystem, logger: TsLogger) => ({
      ...baseContext,
      fileSystem,
      logger,
      $: createMock$(),
    })
  );
  const mockHookExecutor = {
    executeHook: mockExecuteHook,
    createEnhancedContext: mockCreateEnhancedContext,
    logger: new TestLogger(),
    defaultTimeoutMs: 60000,
    executeHooks: mock(async () => [{ success: true, durationMs: 100, skipped: false }]),
  } as unknown as HookExecutor;

  // Create installer instance
  const mockToolInstallationRegistry = createMockToolInstallationRegistry();
  const mockSystemInfo = { platform: 'darwin', arch: 'arm64', homeDir: testDirs.paths.homeDir };
  const installer = new Installer(
    logger,
    fs,
    mockDownloader,
    mockGitHubApiClient,
    mockCargoClient,
    mockArchiveExtractor,
    mockAppConfig,
    mockToolInstallationRegistry,
    mockSystemInfo
  );

  return {
    logger,
    fs,
    mockDownloader,
    mockGitHubApiClient,
    mockCargoClient,
    mockArchiveExtractor,
    mockAppConfig,
    mockToolInstallationRegistry,
    installer,
    fileSystemMocks: spies,
    testDirs,
    mockToolBinaryPath,
    mocks: {
      downloader: mockDownloader,
      download: mockDownload,
      getLatestRelease: mockGetLatestRelease,
      getReleaseByTag: mockGetReleaseByTag,
      extract: mockExtract,
      archiveExtractor: mockArchiveExtractor,
      hookExecutor: mockHookExecutor,
      cargoClient: mockCargoClient,
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
 * Creates a cargo tool config for testing
 */
export function createCargoToolConfig(overrides: Partial<CargoToolConfig> = {}): CargoToolConfig {
  const baseConfig: CargoToolConfig = {
    name: MOCK_TOOL_NAME,
    binaries: [MOCK_TOOL_NAME],
    version: MOCK_TOOL_VERSION,
    installationMethod: 'cargo',
    installParams: {
      crateName: MOCK_TOOL_NAME,
      binarySource: 'cargo-quickinstall',
      versionSource: 'cargo-toml',
      githubRepo: 'mock/repo',
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
  const getToolDir = (toolName: string): string => {
    return path.join(setup.testDirs.paths.binariesDir, toolName);
  };

  return {
    toolName: MOCK_TOOL_NAME,
    installDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME),
    timestamp: '2024-08-13-16-45-23',
    systemInfo: { platform: 'linux', arch: 'x64', homeDir: setup.testDirs.paths.homeDir },
    toolConfig: createGithubReleaseToolConfig(),
    appConfig: setup.mockAppConfig,
    // BaseToolContext properties
    toolDir: getToolDir(MOCK_TOOL_NAME),
    getToolDir,
    homeDir: setup.mockAppConfig.paths.homeDir,
    binDir: setup.mockAppConfig.paths.targetDir,
    shellScriptsDir: setup.mockAppConfig.paths.shellScriptsDir,
    dotfilesDir: setup.mockAppConfig.paths.dotfilesDir,
    generatedDir: setup.mockAppConfig.paths.generatedDir,
    logger: setup.logger.getSubLogger({ name: `test-install-${MOCK_TOOL_NAME}` }),
    ...overrides,
  };
}

/**
 * Helper to setup filesystem mocks for common operations
 */
export function setupFileSystemMocks(setup: InstallerTestSetup): void {
  setup.fileSystemMocks.chmod.mockResolvedValue(undefined);

  // Mock symlink to actually create the symlink in the mock filesystem
  setup.fileSystemMocks.symlink.mockImplementation(async (target: string, linkPath: string) => {
    // Create the parent directory if it doesn't exist
    const parentDir = path.dirname(linkPath);
    await setup.fs.ensureDir(parentDir);

    // Create a mock symlink by writing a special file that indicates it's a symlink
    await setup.fs.writeFile(linkPath, `SYMLINK:${target}`);

    // Override the readlink method for this specific path
    const originalReadlink = setup.fileSystemMocks.readlink;
    setup.fileSystemMocks.readlink.mockImplementation(async (symlinkPath: string) => {
      if (symlinkPath === linkPath) {
        return target;
      }
      return originalReadlink(symlinkPath);
    });

    return undefined;
  });

  setup.fileSystemMocks.copyFile.mockImplementation(async (src: string, dest: string) => {
    // Actually copy the file content in the mock filesystem
    const content = await setup.fs.readFile(src);
    await setup.fs.ensureDir(path.dirname(dest));
    await setup.fs.writeFile(dest, content);
    return undefined;
  });
  setup.fileSystemMocks.rm.mockResolvedValue(undefined);
}
