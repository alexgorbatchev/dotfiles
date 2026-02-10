import type { IArchiveExtractor } from '@dotfiles/archive-extractor';
import type { ProjectConfig } from '@dotfiles/config';
import {
  Architecture,
  createToolLog,
  type IExtractResult,
  type IGitHubRelease,
  type IInstallContext,
  type InstallerPluginRegistry,
  type ISystemInfo,
  Platform,
  type Shell,
} from '@dotfiles/core';
import type { IDownloader } from '@dotfiles/downloader';
import { createMemFileSystem, type IFileSystem, type MockedFileSystem } from '@dotfiles/file-system';
import type { BrewToolConfig } from '@dotfiles/installer-brew';
import type { CargoToolConfig, ICargoClient } from '@dotfiles/installer-cargo';
import type { CurlScriptToolConfig } from '@dotfiles/installer-curl-script';
import type { GithubReleaseToolConfig, IGitHubApiClient } from '@dotfiles/installer-github';
import type { ManualToolConfig } from '@dotfiles/installer-manual';
import { TestLogger, type TsLogger } from '@dotfiles/logger';
import type { IToolInstallationDetails, IToolInstallationRecord, IToolInstallationRegistry } from '@dotfiles/registry';
import { createMockFileRegistry, TrackedFileSystem } from '@dotfiles/registry/file';
import type { ISymlinkGenerator } from '@dotfiles/symlink-generator';
import {
  createMock$,
  createMockProjectConfig,
  createTestDirectories,
  type ITestDirectories,
} from '@dotfiles/testing-helpers';
import { replaceInFile } from '@dotfiles/utils';
import { mock } from 'bun:test';
import path from 'node:path';
import type { ILogObj } from 'tslog';
import { z } from 'zod';
import type { Installer } from '../Installer';
import type { InstallResult } from '../types';
import { createConfiguredShell } from '../utils/createConfiguredShell';
import { HookExecutor } from '../utils/HookExecutor';

interface IInstallEventEmitter {
  emitEvent?: (type: string, data: Record<string, unknown>) => Promise<void>;
}

type IInstallContextWithEmitter = IInstallContext & IInstallEventEmitter;

interface IDownloadOptions {
  destinationPath?: string;
}

interface IExtractOptions {
  targetDir?: string;
}

type RecordToolInstallationMock = ReturnType<typeof mock<(installation: IToolInstallationDetails) => Promise<void>>>;

type GetToolInstallationMock = ReturnType<typeof mock<(toolName: string) => Promise<IToolInstallationRecord | null>>>;

type GetAllToolInstallationsMock = ReturnType<typeof mock<() => Promise<IToolInstallationRecord[]>>>;

type UpdateToolInstallationMock = ReturnType<
  typeof mock<(toolName: string, updates: Partial<IToolInstallationRecord>) => Promise<void>>
>;

type RemoveToolInstallationMock = ReturnType<typeof mock<(toolName: string) => Promise<void>>>;

type IsToolInstalledMock = ReturnType<typeof mock<(toolName: string, version?: string) => Promise<boolean>>>;

type CloseToolInstallationRegistryMock = ReturnType<typeof mock<() => Promise<void>>>;

export interface IToolInstallationRegistryMock extends IToolInstallationRegistry {
  recordToolInstallation: RecordToolInstallationMock;
  getToolInstallation: GetToolInstallationMock;
  getAllToolInstallations: GetAllToolInstallationsMock;
  updateToolInstallation: UpdateToolInstallationMock;
  removeToolInstallation: RemoveToolInstallationMock;
  isToolInstalled: IsToolInstalledMock;
  close: CloseToolInstallationRegistryMock;
}

// Common test data
export const MOCK_TOOL_NAME = 'test-tool';
export const MOCK_TOOL_REPO = 'owner/repo';

export function createMockSymlinkGenerator(fs: IFileSystem): ISymlinkGenerator {
  const result: ISymlinkGenerator = {
    generate: mock(async () => []),
    createBinarySymlink: mock(async (_parentLogger: TsLogger, sourcePath: string, targetPath: string) => {
      // Check if symlink already exists and is valid
      try {
        const stats = await fs.lstat(targetPath);
        if (stats.isSymbolicLink()) {
          const currentTarget = await fs.readlink(targetPath);
          const resolvedTarget = path.isAbsolute(currentTarget)
            ? currentTarget
            : path.resolve(path.dirname(targetPath), currentTarget);

          if (resolvedTarget === path.resolve(sourcePath)) {
            const targetExists = await fs.exists(resolvedTarget);
            if (targetExists) {
              return; // Symlink already exists and is valid
            }
          }
        }
        // Remove invalid symlink or non-symlink file
        await fs.rm(targetPath, { force: true });
      } catch {
        // Target doesn't exist, proceed with creation
      }

      // Verify source exists
      const sourceExists = await fs.exists(sourcePath);
      if (!sourceExists) {
        throw new Error(`Cannot create symlink: binary does not exist at ${sourcePath}`);
      }

      // Create the symlink in the mock filesystem
      await fs.symlink(sourcePath, targetPath);
    }),
  };

  return result;
}

export function createMockCargoClient(): ICargoClient {
  const result: ICargoClient = {
    getCrateMetadata: mock(),
    buildCargoTomlUrl: mock(),
    getCargoTomlPackage: mock(),
    getLatestVersion: mock(),
  };

  return result;
}

export function createMockToolInstallationRegistry(): IToolInstallationRegistryMock {
  const result: IToolInstallationRegistryMock = {
    recordToolInstallation: mock(async (): Promise<void> => {}),
    getToolInstallation: mock(async (): Promise<IToolInstallationRecord | null> => null),
    getAllToolInstallations: mock(async (): Promise<IToolInstallationRecord[]> => []),
    updateToolInstallation: mock(async (): Promise<void> => {}),
    removeToolInstallation: mock(async (): Promise<void> => {}),
    isToolInstalled: mock(async (): Promise<boolean> => false),
    close: mock(async (): Promise<void> => {}),
  };

  return result;
}
export const MOCK_TOOL_VERSION = '1.0.0';

export const MOCK_GITHUB_RELEASE: IGitHubRelease = {
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

export const MOCK_GITHUB_RELEASE_WITH_MULTIPLE_ASSETS: IGitHubRelease = {
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

export const MOCK_GITHUB_RELEASE_WITH_VARIANTS: IGitHubRelease = {
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
export interface IInstallerTestSetup {
  logger: TestLogger<ILogObj>;
  fs: MockedFileSystem;
  trackedFs: TrackedFileSystem;
  mockDownloader: IDownloader;
  mockGitHubApiClient: IGitHubApiClient;
  mockCargoClient: ICargoClient;
  mockArchiveExtractor: IArchiveExtractor;
  mockProjectConfig: ProjectConfig;
  mockToolInstallationRegistry: IToolInstallationRegistryMock;
  pluginRegistry: InstallerPluginRegistry;
  installer: Installer;
  fileSystemMocks: Awaited<ReturnType<typeof createMemFileSystem>>['spies'];
  testDirs: ITestDirectories;
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
    cargoClient: ICargoClient;
  };
}

/**
 * Creates a full installer test setup with all mocks and dependencies
 */
export async function createInstallerTestSetup(): Promise<IInstallerTestSetup> {
  const logger = new TestLogger();
  const hookExecutor = new HookExecutor((): void => {});
  const { fs, spies } = await createMemFileSystem();
  const testDirs = await createTestDirectories(logger, fs, { testName: 'installer-tests' });

  const mockToolBinaryPath = path.join(testDirs.paths.binariesDir, MOCK_TOOL_NAME, MOCK_TOOL_NAME);

  // Setup mock downloader
  const mockDownload = mock(async (_parentLogger: TsLogger, _url: string, options?: IDownloadOptions) => {
    // Create the file in the mock filesystem if destinationPath is provided
    if (options?.destinationPath) {
      await fs.ensureDir(path.dirname(options.destinationPath));
      await fs.writeFile(options.destinationPath, 'mock binary content');
    }
    return Promise.resolve(Buffer.from('mock data'));
  });
  const mockDownloadToFile = mock(
    async (_parentLogger: TsLogger, _url: string, filePath: string, _options?: IDownloadOptions) => {
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, 'mock binary content');
    },
  );
  const mockDownloader: IDownloader = {
    download: mockDownload,
    registerStrategy: mock(() => {}),
    downloadToFile: mockDownloadToFile,
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
    probeLatestTag: mock(() => Promise.resolve(null)),
    getLatestReleaseTags: mock(() => Promise.resolve([])),
  };

  // Setup mock CargoClient
  const mockCargoClient = createMockCargoClient();

  // Setup mock ArchiveExtractor
  const mockExtract = mock(
    async (_parentLogger: TsLogger, _archivePath: string, options?: IExtractOptions): Promise<IExtractResult> => {
      // Create the extracted files in the target directory
      if (options?.targetDir) {
        await fs.ensureDir(options.targetDir);
        // Create both the specific tool name and a generic 'tool' file for hooks to use
        await fs.writeFile(path.join(options.targetDir, MOCK_TOOL_NAME), 'mock-binary-content');
        await fs.chmod(path.join(options.targetDir, MOCK_TOOL_NAME), 0o755);
        await fs.writeFile(path.join(options.targetDir, 'tool'), 'mock-binary-content');
        await fs.chmod(path.join(options.targetDir, 'tool'), 0o755);
        await fs.writeFile(path.join(options.targetDir, 'README.md'), 'mock-readme');
        await fs.writeFile(path.join(options.targetDir, 'LICENSE'), 'mock-license');
        await fs.writeFile(path.join(options.targetDir, 'Makefile'), 'CC=gcc\nall:\n\tgcc -o tool tool.c');
      }
      return {
        extractedFiles: [MOCK_TOOL_NAME, 'tool', 'README.md', 'LICENSE', 'Makefile'],
        executables: [MOCK_TOOL_NAME, 'tool'],
      };
    },
  );
  const mockArchiveExtractor: IArchiveExtractor = {
    extract: mockExtract,
    detectFormat: mock(async () => {
      return 'tar.gz' as const;
    }),
    isSupported: mock(() => true),
  };

  // Setup mock app config
  const mockProjectConfig = await createMockProjectConfig({
    config: {
      paths: testDirs.paths,
    },
    filePath: path.join(testDirs.paths.dotfilesDir, 'config.ts'),
    fileSystem: fs,
    logger,
    systemInfo: {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
      homeDir: testDirs.paths.homeDir,
      hostname: 'test-host',
    },
    env: {},
  });

  // HookExecutor is real, but output is suppressed via injected writer.

  // Create real plugin registry and register a mock plugin
  const { InstallerPluginRegistry } = await import('@dotfiles/core');
  const pluginRegistry = new InstallerPluginRegistry(logger);

  const emptySchema: z.ZodTypeAny = z.object({});

  // Register a mock plugin that emits events
  await pluginRegistry.register({
    method: 'github-release',
    displayName: 'GitHub Release (Mock)',
    version: '1.0.0',
    toolConfigSchema: emptySchema,
    paramsSchema: emptySchema,
    install: async (
      toolName: string,
      _toolConfig: unknown,
      context: IInstallContextWithEmitter,
    ): Promise<InstallResult> => {
      // Simulate download event - this will throw if hook throws
      if (context.emitEvent) {
        await context.emitEvent('after-download', {
          downloadPath: `${context.stagingDir}/${toolName}-darwin-arm64.tar.gz`,
          fileSystem: fs,
        });
      }

      // Create extract directory and mock extracted files for hooks to use
      const extractDir = `${context.stagingDir}/extract`;
      await fs.ensureDir(extractDir);

      // Create a basic 'tool' file that hooks can copy/manipulate
      const toolFile = `${extractDir}/tool`;
      await fs.writeFile(toolFile, '#!/bin/bash\necho "mock tool"');
      await fs.chmod(toolFile, 0o755);

      // Create mock documentation files
      await fs.writeFile(`${extractDir}/README.md`, '# Mock Tool\nThis is a mock tool.');
      await fs.writeFile(`${extractDir}/LICENSE`, 'MIT License');

      // For source-tool specifically, create a Makefile to simulate source distribution
      if (toolName === 'source-tool') {
        await fs.writeFile(`${extractDir}/Makefile`, 'all:\n\t@echo "Building..."');
      }

      // Simulate extract event - this will throw if hook throws
      if (context.emitEvent) {
        await context.emitEvent('after-extract', {
          extractDir,
          extractResult: {
            extractedFiles: [toolName, 'tool', 'README.md', 'LICENSE'],
            executables: [toolName, 'tool'],
            extractDir,
          },
          fileSystem: fs,
        });
      }

      // Return the path to the binary in the extract directory
      // Installer will create the symlink from this to the binaries directory
      const actualBinaryPath = path.join(extractDir, toolName);

      const result: InstallResult = {
        success: true,
        binaryPaths: [actualBinaryPath],
        version: '1.0.0',
        originalTag: 'v1.0.0',
        metadata: {
          method: 'github-release',
          releaseUrl: 'https://github.com/test/repo/releases/tag/v1.0.0',
          publishedAt: '2024-01-01T00:00:00Z',
          releaseName: 'Release v1.0.0',
          downloadUrl: 'https://github.com/test/repo/releases/download/v1.0.0/asset.tar.gz',
          assetName: 'test-asset.tar.gz',
        },
      };

      return result;
    },
  });

  // Register manual plugin for manual installation tests
  const { ManualInstallerPlugin } = await import('@dotfiles/installer-manual');
  const manualPlugin = new ManualInstallerPlugin(fs);
  await pluginRegistry.register(manualPlugin);

  pluginRegistry.composeSchemas();

  // Create installer instance - import here to avoid circular dependency
  const { Installer } = await import('../Installer.js');
  const mockToolInstallationRegistry = createMockToolInstallationRegistry();
  const mockSystemInfo: ISystemInfo = {
    platform: Platform.MacOS,
    arch: Architecture.Arm64,
    homeDir: testDirs.paths.homeDir,
    hostname: 'test-host',
  };
  const mockSymlinkGenerator = createMockSymlinkGenerator(fs);
  const shell = createConfiguredShell(createMock$(), process.env);

  // Create TrackedFileSystem wrapping the mock fs
  const mockFileRegistry = createMockFileRegistry();
  const trackedFs = new TrackedFileSystem(
    logger,
    fs.asIResolvedFileSystem,
    mockFileRegistry,
    TrackedFileSystem.createContext('system', 'binary'),
    mockProjectConfig,
  );

  const installer = new Installer(
    logger,
    trackedFs,
    fs.asIResolvedFileSystem,
    mockProjectConfig,
    mockToolInstallationRegistry,
    mockSystemInfo,
    pluginRegistry,
    mockSymlinkGenerator,
    shell,
    hookExecutor,
  );

  const result: IInstallerTestSetup = {
    logger,
    fs,
    trackedFs,
    mockDownloader,
    mockGitHubApiClient,
    mockCargoClient,
    mockArchiveExtractor,
    mockProjectConfig,
    mockToolInstallationRegistry,
    pluginRegistry,
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
      hookExecutor,
      cargoClient: mockCargoClient,
    },
  };

  return result;
}

/**
 * Creates a GitHub release tool config for testing
 */
export function createGithubReleaseToolConfig(
  overrides: Partial<GithubReleaseToolConfig> = {},
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
  setup: IInstallerTestSetup,
  overrides: Partial<IInstallContext> = {},
): IInstallContext {
  const shell: Shell = createConfiguredShell(createMock$(), process.env);
  const toolDir = path.join(setup.mockProjectConfig.paths.toolConfigsDir, MOCK_TOOL_NAME);

  const baseCurrentDir: string = path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, 'current');

  const baseContext: IInstallContext = {
    toolName: MOCK_TOOL_NAME,
    toolDir,
    currentDir: baseCurrentDir,
    stagingDir: path.join(setup.testDirs.paths.binariesDir, MOCK_TOOL_NAME, 'staging'),
    timestamp: '2024-08-13-16-45-23',
    systemInfo: {
      platform: Platform.Linux,
      arch: Architecture.X86_64,
      homeDir: setup.testDirs.paths.homeDir,
      hostname: 'test-host',
    },
    toolConfig: createGithubReleaseToolConfig(),
    projectConfig: setup.mockProjectConfig,
    $: shell,
    fileSystem: setup.fs,
    replaceInFile: (filePath, from, to, options) =>
      replaceInFile(setup.fs.asIResolvedFileSystem, filePath, from, to, options),
    resolve: () => {
      throw new Error('resolve not supported in test context');
    },
    log: createToolLog(setup.logger, MOCK_TOOL_NAME),
  };

  const currentDir: string = overrides.currentDir ?? baseContext.currentDir;

  const context: IInstallContext = {
    ...baseContext,
    ...overrides,
    currentDir,
  };

  return context;
}

/**
 * Helper to setup filesystem mocks for common operations
 */
export function setupFileSystemMocks(setup: IInstallerTestSetup): void {
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
