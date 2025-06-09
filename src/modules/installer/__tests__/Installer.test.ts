/**
 * @file Tests for the Installer class.
 *
 * ## Development Plan
 *
 * - [x] Setup test environment with mocks for dependencies
 * - [x] Test constructor initialization
 * - [x] Test install method with different installation methods
 * - [x] Test GitHub release installation method
 * - [x] Test Homebrew installation method
 * - [x] Test curl script installation method
 * - [x] Test curl tar installation method
 * - [x] Test manual installation method
 * - [x] Test error handling
 * - [x] Cleanup all linting errors and warnings.
 * - [x] Test URL construction logic for absolute and relative URLs in GitHub release installation.
 * - [x] Test enhanced error message for missing assets in GitHub release installation.
 * - [x] Test population of `otherChanges` in `InstallResult`.
 * - [ ] Ensure 100% test coverage for executable code.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import path from 'node:path';
import type { IFileSystem } from '@modules/file-system/IFileSystem';
import type { IDownloader } from '../../downloader/IDownloader';
import type { IGitHubApiClient } from '@modules/github-client/IGitHubApiClient';
import type { IArchiveExtractor } from '@modules/extractor/IArchiveExtractor'; // Added
import type { AppConfig, ToolConfig, GitHubRelease, ExtractResult } from '@types'; // Added ExtractResult
import { Installer } from '../Installer';
import { createMockFileSystem, createMockAppConfig } from '@testing-helpers';

describe('Installer', () => {
  let mockFileSystem: IFileSystem;
  let mockDownloader: IDownloader;
  let mockGitHubApiClient: IGitHubApiClient;
  let mockArchiveExtractor: IArchiveExtractor; // Added
  let mockAppConfig: AppConfig;
  let installer: Installer;
  let fileSystemMocks: ReturnType<typeof createMockFileSystem>['fileSystemMocks'];

  // Mock functions for non-filesystem dependencies
  let mockDownload: ReturnType<typeof mock>;
  let mockGetLatestRelease: ReturnType<typeof mock>;
  let mockGetReleaseByTag: ReturnType<typeof mock>;
  let mockExtract: ReturnType<typeof mock>; // Added

  // Mock data
  const MOCK_BINARIES_DIR = '/test/binaries';
  const MOCK_BIN_DIR = '/test/bin';
  const MOCK_TOOL_NAME = 'test-tool';
  const MOCK_REPO = 'owner/repo';
  const MOCK_VERSION = '1.0.0';
  const MOCK_BINARY_PATH = '/test/binaries/test-tool/test-tool';

  // Mock GitHub release data
  const mockGitHubRelease: GitHubRelease = {
    id: 123,
    tag_name: MOCK_VERSION,
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

  const mockGitHubReleaseWithMultipleAssets: GitHubRelease = {
    ...mockGitHubRelease,
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

  beforeEach(() => {
    // Reset process.platform and process.arch before each test
    // @ts-ignore
    process.platform = 'linux';
    // @ts-ignore
    process.arch = 'x64';

    // Setup mock file system
    const { mockFileSystem: fsInstance, fileSystemMocks: fsMocks } = createMockFileSystem();
    mockFileSystem = fsInstance;
    fileSystemMocks = fsMocks; // Store for direct use in tests

    // Setup mock downloader
    mockDownload = mock(() => Promise.resolve());
    mockDownloader = {
      download: mockDownload,
    };

    // Setup mock GitHub API client
    mockGetLatestRelease = mock(() => Promise.resolve(mockGitHubRelease));
    mockGetReleaseByTag = mock(() => Promise.resolve(mockGitHubRelease));
    mockGitHubApiClient = {
      getLatestRelease: mockGetLatestRelease,
      getReleaseByTag: mockGetReleaseByTag,
      getAllReleases: mock(() => Promise.resolve([mockGitHubRelease])),
      getReleaseByConstraint: mock(() => Promise.resolve(mockGitHubRelease)),
      getRateLimit: mock(() =>
        Promise.resolve({ limit: 5000, remaining: 4999, reset: 0, used: 1, resource: 'core' })
      ),
    };

    // Setup mock ArchiveExtractor
    mockExtract = mock(
      (): Promise<ExtractResult> =>
        Promise.resolve({
          extractedFiles: ['test-tool-linux-amd64'],
          executables: ['test-tool-linux-amd64'],
        })
    );
    mockArchiveExtractor = {
      extract: mockExtract,
      detectFormat: mock(async () => 'tar.gz' as const),
      isSupported: mock(() => true),
    };

    // Setup mock app config
    mockAppConfig = createMockAppConfig({
      binariesDir: MOCK_BINARIES_DIR,
      binDir: MOCK_BIN_DIR,
    });

    // Create installer instance
    installer = new Installer(
      mockFileSystem,
      mockDownloader,
      mockGitHubApiClient,
      mockArchiveExtractor,
      mockAppConfig
    );
  });

  afterEach(() => {
    // Restore original process.platform and process.arch if they were modified
    // This is important if other tests rely on the actual values
    // For simplicity, we're not storing and restoring original values here,
    // but in a larger test suite, this would be good practice.
    // @ts-ignore
    process.platform = originalPlatform;
    // @ts-ignore
    process.arch = originalArch;
  });

  // Store original platform and arch
  const originalPlatform = process.platform;
  const originalArch = process.arch;

  describe('constructor', () => {
    it('should initialize correctly', () => {
      expect(installer).toBeInstanceOf(Installer);
    });
  });

  describe('install', () => {
    it('should create installation directory', async () => {
      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'github-release',
        installParams: {
          repo: MOCK_REPO,
        },
      } as ToolConfig; // Cast to ToolConfig as it's a valid variant

      await installer.install(MOCK_TOOL_NAME, toolConfig);

      expect(fileSystemMocks.ensureDir).toHaveBeenCalledWith(
        path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME)
      );
    });

    it('should call the appropriate installation method based on installationMethod', async () => {
      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'github-release',
        installParams: {
          repo: MOCK_REPO,
        },
      } as ToolConfig;

      const installFromGitHubReleaseSpy = spyOn(
        installer as any,
        'installFromGitHubRelease'
      ).mockResolvedValue({ success: true, binaryPath: MOCK_BINARY_PATH });

      await installer.install(MOCK_TOOL_NAME, toolConfig);

      expect(installFromGitHubReleaseSpy).toHaveBeenCalledWith(
        MOCK_TOOL_NAME,
        toolConfig,
        expect.objectContaining({ toolName: MOCK_TOOL_NAME }),
        undefined
      );

      installFromGitHubReleaseSpy.mockRestore();
    });

    it('should handle errors during installation', async () => {
      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'github-release',
        installParams: {
          repo: MOCK_REPO,
        },
      } as ToolConfig;

      const error = new Error('Test error');
      const installFromGitHubReleaseSpy = spyOn(
        installer as any,
        'installFromGitHubRelease'
      ).mockRejectedValue(error);

      const result = await installer.install(MOCK_TOOL_NAME, toolConfig);

      expect(result).toEqual({
        success: false,
        error: 'Test error',
        otherChanges: expect.arrayContaining([
          `Ensured installation directory exists: ${path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME)}`,
        ]),
      });

      installFromGitHubReleaseSpy.mockRestore();
    });

    it('should run hooks if defined', async () => {
      const beforeInstallHook = mock(() => Promise.resolve());
      const afterInstallHook = mock(() => Promise.resolve());

      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'github-release',
        installParams: {
          repo: MOCK_REPO,
          hooks: {
            beforeInstall: beforeInstallHook,
            afterInstall: afterInstallHook,
          },
        },
      } as ToolConfig;

      const installFromGitHubReleaseSpy = spyOn(
        installer as any,
        'installFromGitHubRelease'
      ).mockResolvedValue({ success: true, binaryPath: MOCK_BINARY_PATH, otherChanges: [] }); // Ensure spy returns otherChanges

      const result = await installer.install(MOCK_TOOL_NAME, toolConfig); // Capture the result here

      expect(beforeInstallHook).toHaveBeenCalledTimes(1);
      expect(afterInstallHook).toHaveBeenCalledTimes(1);
      expect(result.otherChanges).toEqual(
        expect.arrayContaining([
          `Ensured installation directory exists: ${path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME)}`,
          `Executing beforeInstall hook for ${MOCK_TOOL_NAME}.`,
          `Finished executing beforeInstall hook for ${MOCK_TOOL_NAME}.`,
          // otherChanges from installFromGitHubRelease will be [] due to mockResolvedValue
          `Executing afterInstall hook for ${MOCK_TOOL_NAME}.`,
          `Finished executing afterInstall hook for ${MOCK_TOOL_NAME}.`,
        ])
      );

      installFromGitHubReleaseSpy.mockRestore();
    });
  });

  describe('installFromGitHubRelease', () => {
    it('should download and install from GitHub release, populating otherChanges', async () => {
      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'github-release',
        installParams: {
          repo: MOCK_REPO,
          version: 'latest', // Explicitly set to use latest version
          assetPattern: 'test-tool-linux-amd64', // Explicitly match the mock asset
        },
      } as ToolConfig;
      const initialOtherChanges = ['Initial change'];
      const context = {
        toolName: MOCK_TOOL_NAME,
        installDir: path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME),
        systemInfo: { platform: 'linux', arch: 'x64', release: '' },
        otherChanges: initialOtherChanges,
      };

      const result = await (installer as any).installFromGitHubRelease(
        MOCK_TOOL_NAME,
        toolConfig,
        context
      );

      expect(mockGetLatestRelease).toHaveBeenCalledWith('owner', 'repo');
      expect(mockDownload).toHaveBeenCalledWith(
        'https://example.com/test-tool-linux-amd64',
        expect.objectContaining({
          destinationPath: expect.stringContaining('test-tool-linux-amd64'),
        })
      );
      // If not extracting and not moving, chmod is called once on the downloaded file.
      // If extracting or moving, it's called on the source and then on the destination.
      // The current mock setup for this specific test implies no extraction and no move.
      expect(fileSystemMocks.chmod).toHaveBeenCalledTimes(1);
      expect(fileSystemMocks.symlink).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.version).toBe(MOCK_VERSION);
      expect(result.otherChanges).toEqual(
        expect.arrayContaining([
          ...initialOtherChanges,
          `Fetched release information for ${MOCK_REPO} (version: ${MOCK_VERSION}).`,
          `Selected asset "test-tool-linux-amd64" matching pattern "test-tool-linux-amd64".`,
          'Identified asset for download: test-tool-linux-amd64',
          `Downloaded asset from https://example.com/test-tool-linux-amd64 to ${path.join(
            context.installDir,
            'test-tool-linux-amd64'
          )}.`,
          `Set executable permission (0755) on: ${path.join(
            context.installDir,
            'test-tool-linux-amd64'
          )}`, // Assuming moveBinaryTo is not set, so final path is same as download
          `Created symlink: ${path.join(MOCK_BIN_DIR, MOCK_TOOL_NAME)} -> ${path.join(
            context.installDir,
            'test-tool-linux-amd64'
          )}`,
        ])
      );
    });

    it('should handle invalid repository format', async () => {
      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'github-release',
        installParams: {
          repo: 'invalid-repo',
        },
      } as ToolConfig;

      const result = await (installer as any).installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, {
        toolName: MOCK_TOOL_NAME,
        installDir: path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid GitHub repository format');
      expect(result.otherChanges).toBeDefined();
    });

    it('should handle missing asset, populating otherChanges', async () => {
      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'github-release',
        installParams: {
          repo: MOCK_REPO,
          assetPattern: 'non-existent-pattern',
        },
      } as ToolConfig;
      const initialOtherChanges = ['Initial change for missing asset test'];
      const context = {
        toolName: MOCK_TOOL_NAME,
        installDir: path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME),
        systemInfo: { platform: 'linux', arch: 'x64', release: '' },
        otherChanges: initialOtherChanges,
      };

      const result = await (installer as any).installFromGitHubRelease(
        MOCK_TOOL_NAME,
        toolConfig,
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        `No suitable asset found in release "${MOCK_VERSION}" for asset pattern: "non-existent-pattern".`
      );
      expect(result.error).toContain(`Available assets in release "${MOCK_VERSION}":`);
      expect(result.error).toContain('- test-tool-linux-amd64');
      expect(result.otherChanges).toEqual(
        expect.arrayContaining([
          ...initialOtherChanges,
          `Fetched release information for ${MOCK_REPO} (version: ${MOCK_VERSION}).`,
        ])
      );
    });
  });

  describe('installFromGitHubRelease - URL Construction', () => {
    it('should use absolute browser_download_url directly', async () => {
      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'github-release',
        installParams: {
          repo: MOCK_REPO,
          assetPattern: 'test-tool-linux-amd64',
        },
      } as ToolConfig;
      mockGetLatestRelease.mockResolvedValue({
        ...mockGitHubRelease,
        assets: [
          {
            name: 'test-tool-linux-amd64',
            browser_download_url: 'https://absolute.example.com/download/tool.zip',
            size: 100,
            content_type: 'application/zip',
            state: 'uploaded',
            download_count: 1,
            created_at: '',
            updated_at: '',
          },
        ],
      });

      await (installer as any).installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, {
        toolName: MOCK_TOOL_NAME,
        installDir: path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME),
        systemInfo: { platform: 'linux', arch: 'x64', release: '' },
      });

      expect(mockDownload).toHaveBeenCalledWith(
        'https://absolute.example.com/download/tool.zip',
        expect.anything()
      );
    });

    it('should construct URL with default github.com for relative browser_download_url', async () => {
      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'github-release',
        installParams: {
          repo: MOCK_REPO,
          assetPattern: 'test-tool-linux-amd64',
        },
      } as ToolConfig;
      mockGetLatestRelease.mockResolvedValue({
        ...mockGitHubRelease,
        assets: [
          {
            name: 'test-tool-linux-amd64',
            browser_download_url: '/owner/repo/releases/download/v1.0.0/tool.zip', // Relative URL
            size: 100,
            content_type: 'application/zip',
            state: 'uploaded',
            download_count: 1,
            created_at: '',
            updated_at: '',
          },
        ],
      });

      // Ensure appConfig.githubHost is undefined or not api.github.com
      const testAppConfig = { ...mockAppConfig, githubHost: undefined };
      const tempInstaller = new Installer(
        mockFileSystem,
        mockDownloader,
        mockGitHubApiClient,
        mockArchiveExtractor,
        testAppConfig
      );

      await (tempInstaller as any).installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, {
        toolName: MOCK_TOOL_NAME,
        installDir: path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME),
        systemInfo: { platform: 'linux', arch: 'x64', release: '' },
      });

      expect(mockDownload).toHaveBeenCalledWith(
        'https://github.com/owner/repo/releases/download/v1.0.0/tool.zip',
        expect.anything()
      );
    });

    it('should construct URL with custom githubHost for relative browser_download_url', async () => {
      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'github-release',
        installParams: {
          repo: MOCK_REPO,
          assetPattern: 'test-tool-linux-amd64',
        },
      } as ToolConfig;
      mockGetLatestRelease.mockResolvedValue({
        ...mockGitHubRelease,
        assets: [
          {
            name: 'test-tool-linux-amd64',
            browser_download_url: '/owner/repo/releases/download/v1.0.0/tool.zip',
            size: 100,
            content_type: 'application/zip',
            state: 'uploaded',
            download_count: 1,
            created_at: '',
            updated_at: '',
          },
        ],
      });

      const testAppConfig = { ...mockAppConfig, githubHost: 'github.my-company.com' };
      const tempInstaller = new Installer(
        mockFileSystem,
        mockDownloader,
        mockGitHubApiClient,
        mockArchiveExtractor,
        testAppConfig
      );

      await (tempInstaller as any).installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, {
        toolName: MOCK_TOOL_NAME,
        installDir: path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME),
        systemInfo: { platform: 'linux', arch: 'x64', release: '' },
      });

      expect(mockDownload).toHaveBeenCalledWith(
        'https://github.my-company.com/owner/repo/releases/download/v1.0.0/tool.zip',
        expect.anything()
      );
    });

    it('should use default GitHub host if custom githubHost is api.github.com for relative URL', async () => {
      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'github-release',
        installParams: {
          repo: MOCK_REPO,
          assetPattern: 'test-tool-linux-amd64',
        },
      } as ToolConfig;
      mockGetLatestRelease.mockResolvedValue({
        ...mockGitHubRelease,
        assets: [
          {
            name: 'test-tool-linux-amd64',
            browser_download_url: '/owner/repo/releases/download/v1.0.0/tool.zip',
            size: 100,
            content_type: 'application/zip',
            state: 'uploaded',
            download_count: 1,
            created_at: '',
            updated_at: '',
          },
        ],
      });

      const testAppConfig = { ...mockAppConfig, githubHost: 'api.github.com' }; // API host
      const tempInstaller = new Installer(
        mockFileSystem,
        mockDownloader,
        mockGitHubApiClient,
        mockArchiveExtractor,
        testAppConfig
      );

      await (tempInstaller as any).installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, {
        toolName: MOCK_TOOL_NAME,
        installDir: path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME),
        systemInfo: { platform: 'linux', arch: 'x64', release: '' },
      });

      // Should default to github.com for asset downloads, not api.github.com
      expect(mockDownload).toHaveBeenCalledWith(
        'https://github.com/owner/repo/releases/download/v1.0.0/tool.zip',
        expect.anything()
      );
    });
  });

  describe('installFromGitHubRelease - Enhanced Error Message', () => {
    it('should list available assets when no match found with assetPattern', async () => {
      mockGetLatestRelease.mockResolvedValue(mockGitHubReleaseWithMultipleAssets);
      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'github-release',
        installParams: {
          repo: MOCK_REPO,
          assetPattern: 'non-existent-asset-pattern',
        },
      } as ToolConfig;

      const result = await (installer as any).installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, {
        toolName: MOCK_TOOL_NAME,
        installDir: path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME),
        systemInfo: { platform: 'linux', arch: 'x64', release: '' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        `No suitable asset found in release "${MOCK_VERSION}" for asset pattern: "non-existent-asset-pattern".`
      );
      expect(result.error).toContain(`Available assets in release "${MOCK_VERSION}":`);
      expect(result.error).toContain('- test-tool-linux-amd64');
      expect(result.error).toContain('- test-tool-darwin-arm64.zip');
      expect(result.error).toContain('- test-tool-windows-x64.exe');
    });

    it('should list available assets when no match found with default platform/arch detection', async () => {
      mockGetLatestRelease.mockResolvedValue(mockGitHubReleaseWithMultipleAssets);
      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'github-release',
        installParams: {
          repo: MOCK_REPO,
          // No assetPattern, no assetSelector, rely on platform/arch
        },
      } as ToolConfig;

      // Simulate a platform/arch for which no asset exists
      const systemInfo = { platform: 'sunos', arch: 'sparc', release: '5.11' };
      // @ts-ignore
      process.platform = systemInfo.platform;
      // @ts-ignore
      process.arch = systemInfo.arch;

      const result = await (installer as any).installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, {
        toolName: MOCK_TOOL_NAME,
        installDir: path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME),
        systemInfo,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        `No suitable asset found in release "${MOCK_VERSION}" for platform "sunos" and architecture "sparc".`
      );
      expect(result.error).toContain(`Available assets in release "${MOCK_VERSION}":`);
      expect(result.error).toContain('- test-tool-linux-amd64');
    });

    it('should list available assets when assetSelector returns undefined', async () => {
      mockGetLatestRelease.mockResolvedValue(mockGitHubReleaseWithMultipleAssets);
      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'github-release',
        installParams: {
          repo: MOCK_REPO,
          assetSelector: () => undefined, // Selector that finds nothing
        },
      } as ToolConfig;

      const result = await (installer as any).installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, {
        toolName: MOCK_TOOL_NAME,
        installDir: path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME),
        systemInfo: { platform: 'linux', arch: 'x64', release: '' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        `No suitable asset found in release "${MOCK_VERSION}" using a custom assetSelector function.`
      );
      expect(result.error).toContain(`Available assets in release "${MOCK_VERSION}":`);
      expect(result.error).toContain('- test-tool-darwin-arm64.zip');
    });
  });

  describe('installFromBrew', () => {
    it('should simulate brew installation', async () => {
      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'brew',
        installParams: {
          formula: 'test-formula',
          cask: true,
          tap: 'test-tap',
        },
      } as ToolConfig;

      const result = await (installer as any).installFromBrew(MOCK_TOOL_NAME, toolConfig, {
        toolName: MOCK_TOOL_NAME,
        installDir: path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME),
      });

      expect(result.success).toBe(true);
      expect(result.info).toEqual({
        formula: 'test-formula',
        isCask: true,
        tap: 'test-tap',
      });
      expect(result.otherChanges).toEqual(
        expect.arrayContaining([
          "Using 'brew' command for installation.",
          'Tapping Homebrew repository: test-tap',
          'Preparing to install Homebrew formula/cask: test-formula',
          'Executing Homebrew command: brew tap test-tap && brew install --cask test-formula',
          'Simulated successful execution of Homebrew command.',
          `Assuming binary path after Homebrew install: /usr/local/bin/${MOCK_TOOL_NAME}`,
        ])
      );
    });
  });

  describe('installFromCurlScript', () => {
    it('should download and execute script, populating otherChanges', async () => {
      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'curl-script',
        installParams: {
          url: 'https://example.com/install.sh',
          shell: 'bash',
        },
      } as ToolConfig;

      const result = await (installer as any).installFromCurlScript(MOCK_TOOL_NAME, toolConfig, {
        toolName: MOCK_TOOL_NAME,
        installDir: path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME),
      });

      expect(mockDownload).toHaveBeenCalledWith(
        'https://example.com/install.sh',
        expect.objectContaining({
          destinationPath: expect.stringContaining('test-tool-install.sh'),
        })
      );
      expect(fileSystemMocks.chmod).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.info).toEqual({
        scriptUrl: 'https://example.com/install.sh',
        shell: 'bash',
      });
      expect(result.otherChanges).toEqual(
        expect.arrayContaining([
          `Downloaded installation script from https://example.com/install.sh to ${path.join(
            MOCK_BINARIES_DIR,
            MOCK_TOOL_NAME,
            `${MOCK_TOOL_NAME}-install.sh`
          )}.`,
          `Set executable permission (0755) on script: ${path.join(
            MOCK_BINARIES_DIR,
            MOCK_TOOL_NAME,
            `${MOCK_TOOL_NAME}-install.sh`
          )}`,
          `Executing installation script ${path.join(
            MOCK_BINARIES_DIR,
            MOCK_TOOL_NAME,
            `${MOCK_TOOL_NAME}-install.sh`
          )} using bash.`,
          'Simulated successful execution of installation script.',
          `Assuming binary path after script execution: /usr/local/bin/${MOCK_TOOL_NAME}`,
        ])
      );
    });
  });

  describe('installFromCurlTar', () => {
    it('should download and extract tarball, populating otherChanges', async () => {
      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'curl-tar',
        installParams: {
          url: 'https://example.com/archive.tar.gz',
          extractPath: 'bin/tool',
          moveBinaryTo: 'bin/tool-renamed',
        },
      } as ToolConfig;

      // Setup mockExists for the path of the binary within the extracted directory
      const expectedExtractedBinaryPath = path.join(
        MOCK_BINARIES_DIR,
        MOCK_TOOL_NAME,
        'extracted',
        'bin/tool' // This comes from toolConfig.installParams.extractPath
      );
      const installDir = path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME);
      const extractDir = path.join(installDir, 'extracted');
      (fileSystemMocks.exists as ReturnType<typeof mock>).mockImplementation(async (p) => {
        return p === expectedExtractedBinaryPath || p === extractDir;
      });
      const initialOtherChanges = ['Initial curl tar change']; // Defined here
      const context = {
        // context is defined here
        toolName: MOCK_TOOL_NAME,
        installDir,
        otherChanges: initialOtherChanges,
      };

      const result = await (installer as any).installFromCurlTar(
        MOCK_TOOL_NAME,
        toolConfig,
        context // Pass the defined context
      );

      expect(mockDownload).toHaveBeenCalledWith(
        'https://example.com/archive.tar.gz',
        expect.objectContaining({
          destinationPath: expect.stringContaining('test-tool.tar.gz'),
        })
      );
      expect(fileSystemMocks.ensureDir).toHaveBeenCalled();
      expect(fileSystemMocks.chmod).toHaveBeenCalled();
      expect(fileSystemMocks.copyFile).toHaveBeenCalled();
      expect(fileSystemMocks.symlink).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.info).toEqual({
        tarballUrl: 'https://example.com/archive.tar.gz',
      });
      const tarballPath = path.join(installDir, `${MOCK_TOOL_NAME}.tar.gz`);
      const extractedBinaryPath = path.join(extractDir, 'bin/tool');
      const finalBinaryDestPath = path.join(installDir, 'bin/tool-renamed');
      const symlinkPath = path.join(MOCK_BIN_DIR, MOCK_TOOL_NAME);

      expect(result.otherChanges).toEqual(
        expect.arrayContaining([
          ...initialOtherChanges,
          `Downloaded tarball from https://example.com/archive.tar.gz to ${tarballPath}.`,
          `Starting extraction of tarball: ${tarballPath}`,
          `Ensured extraction directory exists: ${extractDir}`,
          `Extracted tarball ${tarballPath} to ${extractDir}. Files: test-tool-linux-amd64.`, // Mocked extract result
          `Determined binary path after extraction: ${extractedBinaryPath}`,
          `Set executable permission (0755) on: ${extractedBinaryPath}`,
          `Copied binary from ${extractedBinaryPath} to ${finalBinaryDestPath}.`,
          `Set executable permission (0755) on: ${finalBinaryDestPath}`,
          `Cleaned up temporary extraction directory: ${extractDir}`, // This should be present
          `Created symlink: ${symlinkPath} -> ${finalBinaryDestPath}`,
        ])
      );
    });
  });

  describe('installManually', () => {
    it('should check if binary exists, populating otherChanges', async () => {
      (fileSystemMocks.exists as ReturnType<typeof mock>).mockResolvedValue(true);
      const manualBinaryPath = '/usr/local/bin/test-tool';
      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'manual',
        installParams: {
          binaryPath: manualBinaryPath,
        },
      } as ToolConfig;
      const context = {
        toolName: MOCK_TOOL_NAME,
        installDir: path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME),
        otherChanges: ['Initial manual change'],
      };

      const result = await (installer as any).installManually(MOCK_TOOL_NAME, toolConfig, context);

      expect(fileSystemMocks.exists).toHaveBeenCalledWith(manualBinaryPath);
      expect(result.success).toBe(true);
      expect(result.binaryPath).toBe(manualBinaryPath);
      expect(result.otherChanges).toEqual(
        expect.arrayContaining([
          'Initial manual change',
          `Manual installation: expecting binary at ${manualBinaryPath}.`,
          `Binary found at specified path: ${manualBinaryPath}.`,
        ])
      );
    });

    it('should return error if binary does not exist, populating otherChanges', async () => {
      (fileSystemMocks.exists as ReturnType<typeof mock>).mockResolvedValue(false);
      const manualBinaryPath = '/usr/local/bin/non-existent-tool';
      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'manual',
        installParams: {
          binaryPath: manualBinaryPath,
        },
      } as ToolConfig;
      const context = {
        toolName: MOCK_TOOL_NAME,
        installDir: path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME),
        otherChanges: ['Initial manual error change'],
      };
      const result = await (installer as any).installManually(MOCK_TOOL_NAME, toolConfig, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Binary not found');
      expect(result.otherChanges).toEqual(
        expect.arrayContaining([
          'Initial manual error change',
          `Manual installation: expecting binary at ${manualBinaryPath}.`,
          `Binary not found at specified path: ${manualBinaryPath}.`,
        ])
      );
    });
  });
});
