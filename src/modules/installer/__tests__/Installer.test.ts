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
 * - [x] Test pip installation method
 * - [x] Test manual installation method
 * - [x] Test error handling
 * - [x] Cleanup all linting errors and warnings.
 * - [ ] Ensure 100% test coverage for executable code.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import path from 'node:path';
import type { IFileSystem } from '../../file-system/IFileSystem';
import type { IDownloader } from '../../downloader/IDownloader';
import type { IGitHubApiClient } from '../../github-client/IGitHubApiClient';
import type { IArchiveExtractor } from '../../extractor/IArchiveExtractor'; // Added
import type { AppConfig, ToolConfig, GitHubRelease, ExtractResult } from '../../../types'; // Added ExtractResult
import { Installer } from '../Installer';
import { createMockAppConfig } from '../../../testing-helpers/appConfigTestHelpers';

describe('Installer', () => {
  let mockFileSystem: IFileSystem;
  let mockDownloader: IDownloader;
  let mockGitHubApiClient: IGitHubApiClient;
  let mockArchiveExtractor: IArchiveExtractor; // Added
  let mockAppConfig: AppConfig;
  let installer: Installer;

  // Mock functions
  let mockEnsureDir: ReturnType<typeof mock>;
  let mockChmod: ReturnType<typeof mock>;
  let mockExists: ReturnType<typeof mock>;
  let mockCopyFile: ReturnType<typeof mock>;
  let mockSymlink: ReturnType<typeof mock>;
  let mockRm: ReturnType<typeof mock>;
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

  beforeEach(() => {
    // Setup mock file system
    mockEnsureDir = mock(() => Promise.resolve());
    mockChmod = mock(() => Promise.resolve());
    mockExists = mock(() => Promise.resolve(false));
    mockCopyFile = mock(() => Promise.resolve());
    mockSymlink = mock(() => Promise.resolve());
    mockRm = mock(() => Promise.resolve());

    mockFileSystem = {
      ensureDir: mockEnsureDir,
      chmod: mockChmod,
      exists: mockExists,
      copyFile: mockCopyFile,
      symlink: mockSymlink,
      rm: mockRm,
      readFile: mock(() => Promise.resolve('')),
      writeFile: mock(() => Promise.resolve()),
      mkdir: mock(() => Promise.resolve()),
      readdir: mock(() => Promise.resolve([])),
      stat: mock(async () => ({ isDirectory: () => true }) as any),
      readlink: mock(async () => ''),
      rename: mock(async () => {}),
      rmdir: mock(async () => {}),
    };

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
      };

      await installer.install(MOCK_TOOL_NAME, toolConfig);

      expect(mockEnsureDir).toHaveBeenCalledWith(path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME));
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
      };

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
      };

      const error = new Error('Test error');
      const installFromGitHubReleaseSpy = spyOn(
        installer as any,
        'installFromGitHubRelease'
      ).mockRejectedValue(error);

      const result = await installer.install(MOCK_TOOL_NAME, toolConfig);

      expect(result).toEqual({
        success: false,
        error: 'Test error',
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
      };

      const installFromGitHubReleaseSpy = spyOn(
        installer as any,
        'installFromGitHubRelease'
      ).mockResolvedValue({ success: true, binaryPath: MOCK_BINARY_PATH });

      await installer.install(MOCK_TOOL_NAME, toolConfig);

      expect(beforeInstallHook).toHaveBeenCalledTimes(1);
      expect(afterInstallHook).toHaveBeenCalledTimes(1);

      installFromGitHubReleaseSpy.mockRestore();
    });
  });

  describe('installFromGitHubRelease', () => {
    it('should download and install from GitHub release', async () => {
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
      };

      const result = await (installer as any).installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, {
        toolName: MOCK_TOOL_NAME,
        installDir: path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME),
      });

      expect(mockGetLatestRelease).toHaveBeenCalledWith('owner', 'repo');
      expect(mockDownload).toHaveBeenCalledWith(
        'https://example.com/test-tool-linux-amd64',
        expect.objectContaining({
          destinationPath: expect.stringContaining('test-tool-linux-amd64'),
        })
      );
      expect(mockChmod).toHaveBeenCalled();
      expect(mockSymlink).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.version).toBe(MOCK_VERSION);
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
      };

      const result = await (installer as any).installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, {
        toolName: MOCK_TOOL_NAME,
        installDir: path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid GitHub repository format');
    });

    it('should handle missing asset', async () => {
      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'github-release',
        installParams: {
          repo: MOCK_REPO,
          assetPattern: 'non-existent-pattern',
        },
      };

      const result = await (installer as any).installFromGitHubRelease(MOCK_TOOL_NAME, toolConfig, {
        toolName: MOCK_TOOL_NAME,
        installDir: path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No matching asset found');
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
        } as any,
      };

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
    });
  });

  describe('installFromCurlScript', () => {
    it('should download and execute script', async () => {
      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'curl-script',
        installParams: {
          url: 'https://example.com/install.sh',
          shell: 'bash',
        } as any,
      };

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
      expect(mockChmod).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.info).toEqual({
        scriptUrl: 'https://example.com/install.sh',
        shell: 'bash',
      });
    });
  });

  describe('installFromCurlTar', () => {
    it('should download and extract tarball', async () => {
      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'curl-tar',
        installParams: {
          url: 'https://example.com/archive.tar.gz',
          extractPath: 'bin/tool',
          moveBinaryTo: 'bin/tool-renamed',
        } as any,
      };

      // Setup mockExists for the path of the binary within the extracted directory
      const expectedExtractedBinaryPath = path.join(
        MOCK_BINARIES_DIR,
        MOCK_TOOL_NAME,
        'extracted',
        'bin/tool' // This comes from toolConfig.installParams.extractPath
      );
      mockExists.mockImplementation(async (p) => p === expectedExtractedBinaryPath);

      const result = await (installer as any).installFromCurlTar(MOCK_TOOL_NAME, toolConfig, {
        toolName: MOCK_TOOL_NAME,
        installDir: path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME),
      });

      expect(mockDownload).toHaveBeenCalledWith(
        'https://example.com/archive.tar.gz',
        expect.objectContaining({
          destinationPath: expect.stringContaining('test-tool.tar.gz'),
        })
      );
      expect(mockEnsureDir).toHaveBeenCalled();
      expect(mockChmod).toHaveBeenCalled();
      expect(mockCopyFile).toHaveBeenCalled();
      expect(mockSymlink).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.info).toEqual({
        tarballUrl: 'https://example.com/archive.tar.gz',
      });
    });
  });

  describe('installFromPip', () => {
    it('should simulate pip installation', async () => {
      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'pip',
        installParams: {
          packageName: 'test-package',
        } as any,
      };

      const result = await (installer as any).installFromPip(MOCK_TOOL_NAME, toolConfig, {
        toolName: MOCK_TOOL_NAME,
        installDir: path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME),
      });

      expect(result.success).toBe(true);
      expect(result.info).toEqual({
        packageName: 'test-package',
      });
    });
  });

  describe('installManually', () => {
    it('should check if binary exists', async () => {
      mockExists.mockResolvedValue(true);

      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'manual',
        installParams: {
          binaryPath: '/usr/local/bin/test-tool',
        } as any,
      };

      const result = await (installer as any).installManually(MOCK_TOOL_NAME, toolConfig, {
        toolName: MOCK_TOOL_NAME,
        installDir: path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME),
      });

      expect(mockExists).toHaveBeenCalledWith('/usr/local/bin/test-tool');
      expect(result.success).toBe(true);
      expect(result.binaryPath).toBe('/usr/local/bin/test-tool');
    });

    it('should return error if binary does not exist', async () => {
      mockExists.mockResolvedValue(false);

      const toolConfig: ToolConfig = {
        name: MOCK_TOOL_NAME,
        binaries: [MOCK_TOOL_NAME],
        version: MOCK_VERSION,
        installationMethod: 'manual',
        installParams: {
          binaryPath: '/usr/local/bin/test-tool',
        } as any,
      };

      const result = await (installer as any).installManually(MOCK_TOOL_NAME, toolConfig, {
        toolName: MOCK_TOOL_NAME,
        installDir: path.join(MOCK_BINARIES_DIR, MOCK_TOOL_NAME),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Binary not found');
    });
  });
});
