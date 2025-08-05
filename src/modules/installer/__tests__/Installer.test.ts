import type { YamlConfig } from '@modules/config';
import { createYamlConfigFromObject } from '@modules/config-loader';
import type { IDownloader } from '@modules/downloader';
import type { IArchiveExtractor } from '@modules/extractor';
import type { IFileSystem } from '@modules/file-system';
import type { IGitHubApiClient } from '@modules/github-client';
import {
  createMemFileSystem,
  createTestDirectories,
  type TestDirectories,
  TestLogger,
} from '@testing-helpers';
import type { ExtractResult, GitHubRelease, ToolConfig } from '@types';
import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import path from 'node:path';
import { Installer } from '../Installer';

import type { ILogObj } from 'tslog';

describe('Installer', () => {
  let logger: TestLogger<ILogObj>;
  let mockFileSystem: IFileSystem;
  let mockDownloader: IDownloader;
  let mockGitHubApiClient: IGitHubApiClient;
  let mockArchiveExtractor: IArchiveExtractor;
  let mockAppConfig: YamlConfig;
  let installer: Installer;
  let fileSystemMocks: Awaited<ReturnType<typeof createMemFileSystem>>['spies'];
  let testDirs: TestDirectories;

  let mockDownload: ReturnType<typeof mock>;
  let mockGetLatestRelease: ReturnType<typeof mock>;
  let mockGetReleaseByTag: ReturnType<typeof mock>;
  let mockExtract: ReturnType<typeof mock>;

  const mockToolName = 'test-tool';
  const mockToolRepo = 'owner/repo';
  const mockToolVersion = '1.0.0';
  let mockToolBinaryPath: string;

  const mockGitHubRelease: GitHubRelease = {
    id: 123,
    tag_name: mockToolVersion,
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

  beforeEach(async () => {
    logger = new TestLogger();
    const { fs, spies } = await createMemFileSystem();
    testDirs = await createTestDirectories(logger, fs, { testName: 'installer-tests' });
    mockFileSystem = fs;
    fileSystemMocks = spies;

    mockToolBinaryPath = path.join(testDirs.paths.binariesDir, mockToolName, mockToolName);

    mockDownload = mock(() => Promise.resolve());
    mockDownloader = {
      download: mockDownload,
      registerStrategy: mock(() => {}),
      downloadToFile: mock(() => Promise.resolve()),
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
    mockAppConfig = await createYamlConfigFromObject(
      logger,
      mockFileSystem,
      {
        paths: {
          ...testDirs.paths,
        },
      },
      { platform: 'linux', arch: 'x64', release: 'test', homeDir: testDirs.paths.homeDir },
      {}
    );

    // Create installer instance
    installer = new Installer(
      logger,
      mockFileSystem,
      mockDownloader,
      mockGitHubApiClient,
      mockArchiveExtractor,
      mockAppConfig,
    );
  });

  describe('install', () => {
    it('should create installation directory', async () => {
      const toolConfig: ToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
        },
      }; 

      await installer.install(mockToolName, toolConfig);

      expect(fileSystemMocks.ensureDir).toHaveBeenCalledWith(
        path.join(testDirs.paths.binariesDir, mockToolName)
      );
    });

    it('should call the appropriate installation method based on installationMethod', async () => {
      const toolConfig: ToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
        },
      };

      const installFromGitHubReleaseSpy = spyOn(
        installer,
        'installFromGitHubRelease'
      ).mockResolvedValue({ success: true, binaryPath: mockToolBinaryPath });

      await installer.install(mockToolName, toolConfig);

      expect(installFromGitHubReleaseSpy).toHaveBeenCalledWith(
        mockToolName,
        toolConfig,
        expect.objectContaining({ toolName: mockToolName }),
        undefined
      );

      installFromGitHubReleaseSpy.mockRestore();
    });

    it('should handle errors during installation', async () => {
      const toolConfig: ToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
        },
      };

      const error = new Error('Test error');
      const installFromGitHubReleaseSpy = spyOn(
        installer,
        'installFromGitHubRelease'
      ).mockRejectedValue(error);

      const result = await installer.install(mockToolName, toolConfig);

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
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          hooks: {
            beforeInstall: beforeInstallHook,
            afterInstall: afterInstallHook,
          },
        },
      };

      const installFromGitHubReleaseSpy = spyOn(
        installer,
        'installFromGitHubRelease'
      ).mockResolvedValue({ success: true, binaryPath: mockToolBinaryPath });

      await installer.install(mockToolName, toolConfig); 

      expect(beforeInstallHook).toHaveBeenCalledTimes(1);
      expect(afterInstallHook).toHaveBeenCalledTimes(1);

      installFromGitHubReleaseSpy.mockRestore();
    });
  });

  describe('installFromGitHubRelease', () => {
    it('should download and install from GitHub release', async () => {
      const toolConfig: ToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          version: 'latest', // Explicitly set to use latest version
          assetPattern: 'test-tool-linux-amd64', // Explicitly match the mock asset
        },
      };
      const context = {
        toolName: mockToolName,
        installDir: path.join(testDirs.paths.binariesDir, mockToolName),
        systemInfo: { platform: 'linux', arch: 'x64', release: '' },
      };

      // Mock chmod and symlink to avoid errors on non-existent files from mock downloader
      fileSystemMocks.chmod.mockResolvedValue(undefined);
      fileSystemMocks.symlink.mockResolvedValue(undefined);

      const result = await installer.installFromGitHubRelease(mockToolName, toolConfig, context);

      expect(mockGetLatestRelease).toHaveBeenCalledWith('owner', 'repo');
      expect(mockDownload).toHaveBeenCalledWith(
        'https://example.com/test-tool-linux-amd64',
        expect.objectContaining({
          destinationPath: expect.stringContaining('test-tool-linux-amd64'),
        })
      );
      expect(result.success).toBe(true);
    });

    it('should handle invalid repository format', async () => {
      const toolConfig: ToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: 'invalid-repo',
        },
      };

      const result = await installer.installFromGitHubRelease(mockToolName, toolConfig, {
        toolName: mockToolName,
        installDir: path.join(testDirs.paths.binariesDir, mockToolName),
        systemInfo: { platform: 'linux', arch: 'x64', release: '' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid GitHub repository format');
    });

    it('should handle missing asset', async () => {
      const toolConfig: ToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          assetPattern: 'non-existent-pattern',
        },
      };
      const context = {
        toolName: mockToolName,
        installDir: path.join(testDirs.paths.binariesDir, mockToolName),
        systemInfo: { platform: 'linux', arch: 'x64', release: '' },
      };

      const result = await installer.installFromGitHubRelease(mockToolName, toolConfig, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        `No suitable asset found in release "${mockToolVersion}" for asset pattern: "non-existent-pattern".`
      );
      expect(result.error).toContain(`Available assets in release "${mockToolVersion}":`);
      expect(result.error).toContain('- test-tool-linux-amd64');
    });
  });

  describe('installFromGitHubRelease - URL Construction', () => {
    it('should use absolute browser_download_url directly', async () => {
      const toolConfig: ToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          assetPattern: 'test-tool-linux-amd64',
        },
      };
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

      await installer.installFromGitHubRelease(mockToolName, toolConfig, {
        toolName: mockToolName,
        installDir: path.join(testDirs.paths.binariesDir, mockToolName),
        systemInfo: { platform: 'linux', arch: 'x64', release: '', homeDir: '/home/test' },
      });

      expect(mockDownload).toHaveBeenCalledWith(
        'https://absolute.example.com/download/tool.zip',
        expect.anything()
      );
    });

    it('should construct URL with default github.com for relative browser_download_url', async () => {
      const toolConfig: ToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          assetPattern: 'test-tool-linux-amd64',
        },
      };
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

      // Ensure appConfig.github.host is undefined or not api.github.com
      const testAppConfig = await createYamlConfigFromObject(
        logger,
        mockFileSystem,
        {
          paths: {
            ...testDirs.paths,
          },
          github: { host: undefined },
        },
        { platform: 'linux', arch: 'x64', release: 'test', homeDir: testDirs.paths.homeDir },
        {}
      );
      const tempInstaller = new Installer(
        logger,
        mockFileSystem,
        mockDownloader,
        mockGitHubApiClient,
        mockArchiveExtractor,
        testAppConfig,
      );

      await tempInstaller.installFromGitHubRelease(mockToolName, toolConfig, {
        toolName: mockToolName,
        installDir: path.join(testDirs.paths.binariesDir, mockToolName),
        systemInfo: {
          platform: 'linux',
          arch: 'x64',
          release: '',
          homeDir: testDirs.paths.homeDir,
        },
      });

      expect(mockDownload).toHaveBeenCalledWith(
        'https://github.com/owner/repo/releases/download/v1.0.0/tool.zip',
        expect.anything()
      );
    });

    it('should construct URL with custom githubHost for relative browser_download_url', async () => {
      const toolConfig: ToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          assetPattern: 'test-tool-linux-amd64',
        },
      };
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

      const testAppConfig = await createYamlConfigFromObject(
        logger,
        mockFileSystem,
        {
          paths: {
            ...testDirs.paths,
          },
          github: { host: 'github.my-company.com' },
        },
        { platform: 'linux', arch: 'x64', release: 'test', homeDir: testDirs.paths.homeDir },
        {}
      );
      const tempInstaller = new Installer(
        logger,
        mockFileSystem,
        mockDownloader,
        mockGitHubApiClient,
        mockArchiveExtractor,
        testAppConfig,
      );

      await tempInstaller.installFromGitHubRelease(mockToolName, toolConfig, {
        toolName: mockToolName,
        installDir: path.join(testDirs.paths.binariesDir, mockToolName),
        systemInfo: { platform: 'linux', arch: 'x64', release: '' },
      });

      expect(mockDownload).toHaveBeenCalledWith(
        'https://github.my-company.com/owner/repo/releases/download/v1.0.0/tool.zip',
        expect.anything()
      );
    });

    it('should use default GitHub host if custom githubHost is api.github.com for relative URL', async () => {
      const toolConfig: ToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          assetPattern: 'test-tool-linux-amd64',
        },
      };
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

      const testAppConfig = await createYamlConfigFromObject(
        logger,
        mockFileSystem,
        {
          paths: {
            ...testDirs.paths,
          },
          github: { host: 'api.github.com' },
        },
        { platform: 'linux', arch: 'x64', release: 'test', homeDir: testDirs.paths.homeDir },
        {}
      ); // API host
      const tempInstaller = new Installer(
        logger,
        mockFileSystem,
        mockDownloader,
        mockGitHubApiClient,
        mockArchiveExtractor,
        testAppConfig,
      );

      await tempInstaller.installFromGitHubRelease(mockToolName, toolConfig, {
        toolName: mockToolName,
        installDir: path.join(testDirs.paths.binariesDir, mockToolName),
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
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          assetPattern: 'non-existent-asset-pattern',
        },
      };

      const result = await installer.installFromGitHubRelease(mockToolName, toolConfig, {
        toolName: mockToolName,
        installDir: path.join(testDirs.paths.binariesDir, mockToolName),
        systemInfo: { platform: 'linux', arch: 'x64', release: '' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        `No suitable asset found in release "${mockToolVersion}" for asset pattern: "non-existent-asset-pattern".`
      );
      expect(result.error).toContain(`Available assets in release "${mockToolVersion}":`);
      expect(result.error).toContain('- test-tool-linux-amd64');
      expect(result.error).toContain('- test-tool-darwin-arm64.zip');
      expect(result.error).toContain('- test-tool-windows-x64.exe');
    });

    it('should list available assets when no match found with default platform/arch detection', async () => {
      mockGetLatestRelease.mockResolvedValue(mockGitHubReleaseWithMultipleAssets);
      const toolConfig: ToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          // No assetPattern, no assetSelector, rely on platform/arch
        },
      };

      // Simulate a platform/arch for which no asset exists
      const systemInfo = {
        platform: 'sunos',
        arch: 'sparc',
        release: '5.11',
        homeDir: '/home/test',
      };
      // @ts-ignore
      process.platform = systemInfo.platform;
      // @ts-ignore
      process.arch = systemInfo.arch;

      const result = await installer.installFromGitHubRelease(mockToolName, toolConfig, {
        toolName: mockToolName,
        installDir: path.join(testDirs.paths.binariesDir, mockToolName),
        systemInfo,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        `No suitable asset found in release "${mockToolVersion}" for platform "sunos" and architecture "sparc".`
      );
      expect(result.error).toContain(`Available assets in release "${mockToolVersion}":`);
      expect(result.error).toContain('- test-tool-linux-amd64');
    });

    it('should list available assets when assetSelector returns undefined', async () => {
      mockGetLatestRelease.mockResolvedValue(mockGitHubReleaseWithMultipleAssets);
      const toolConfig: ToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          assetSelector: () => undefined, // Selector that finds nothing
        },
      };

      const result = await installer.installFromGitHubRelease(mockToolName, toolConfig, {
        toolName: mockToolName,
        installDir: path.join(testDirs.paths.binariesDir, mockToolName),
        systemInfo: { platform: 'linux', arch: 'x64', release: '' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        `No suitable asset found in release "${mockToolVersion}" using a custom assetSelector function.`
      );
      expect(result.error).toContain(`Available assets in release "${mockToolVersion}":`);
      expect(result.error).toContain('- test-tool-darwin-arm64.zip');
    });
  });

  describe('installFromBrew', () => {
    it('should simulate brew installation', async () => {
      const toolConfig: ToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'brew',
        installParams: {
          formula: 'test-formula',
          cask: true,
          tap: 'test-tap',
        },
      };

      const result = await installer.installFromBrew(mockToolName, toolConfig, {
        toolName: mockToolName,
        installDir: path.join(testDirs.paths.binariesDir, mockToolName),
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
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'curl-script',
        installParams: {
          url: 'https://example.com/install.sh',
          shell: 'bash',
        },
      };

      const installDir = path.join(testDirs.paths.binariesDir, mockToolName);
      const scriptPath = path.join(installDir, `${mockToolName}-install.sh`);
      const assumedBinaryPath = path.join('/usr/local/bin', mockToolName);

      // Simulate the script being downloaded and the final binary being "created" by the script.
      await mockFileSystem.ensureDir(installDir); // Ensure parent directory exists
      await mockFileSystem.writeFile(scriptPath, '#!/bin/bash\necho "installed"');
      await mockFileSystem.ensureDir(path.dirname(assumedBinaryPath)); // Ensure parent for assumed binary
      await mockFileSystem.writeFile(assumedBinaryPath, 'binary content');

      const result = await installer.installFromCurlScript(mockToolName, toolConfig, {
        toolName: mockToolName,
        installDir,
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
    });
  });

  describe('installFromCurlTar', () => {
    it('should download and extract tarball', async () => {
      const toolConfig: ToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'curl-tar',
        installParams: {
          url: 'https://example.com/archive.tar.gz',
          extractPath: 'bin/tool',
          moveBinaryTo: 'bin/tool-renamed',
        },
      };

      // Setup mockExists for the path of the binary within the extracted directory
      const expectedExtractedBinaryPath = path.join(
        testDirs.paths.binariesDir,
        mockToolName,
        'extracted',
        'bin/tool' // This comes from toolConfig.installParams.extractPath
      );
      const installDir = path.join(testDirs.paths.binariesDir, mockToolName);
      const extractDir = path.join(installDir, 'extracted');
      (fileSystemMocks.exists as ReturnType<typeof mock>).mockImplementation(async (p) => {
        return p === expectedExtractedBinaryPath || p === extractDir;
      });
      const context = {
        // context is defined here
        toolName: mockToolName,
        installDir,
      };

      // Simulate the existence of the extracted binary before calling the method
      await mockFileSystem.ensureDir(path.dirname(expectedExtractedBinaryPath)); // Ensure parent dir exists
      await mockFileSystem.writeFile(expectedExtractedBinaryPath, 'binary content');

      const result = await installer.installFromCurlTar(
        mockToolName,
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
      // copyFile IS called when moveBinaryTo is set
      expect(fileSystemMocks.copyFile).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.info).toEqual({
        tarballUrl: 'https://example.com/archive.tar.gz',
      });
    });
  });

  describe('installManually', () => {
    it('should check if binary exists', async () => {
      (fileSystemMocks.exists as ReturnType<typeof mock>).mockResolvedValue(true);
      const manualBinaryPath = '/usr/local/bin/test-tool';
      const toolConfig: ToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'manual',
        installParams: {
          binaryPath: manualBinaryPath,
        },
      };
      const context = {
        toolName: mockToolName,
        installDir: path.join(testDirs.paths.binariesDir, mockToolName),
      };

      const result = await installer.installManually(mockToolName, toolConfig, context);

      expect(fileSystemMocks.exists).toHaveBeenCalledWith(manualBinaryPath);
      expect(result.success).toBe(true);
      expect(result.binaryPath).toBe(manualBinaryPath);
    });

    it('should return error if binary does not exist', async () => {
      (fileSystemMocks.exists as ReturnType<typeof mock>).mockResolvedValue(false);
      const manualBinaryPath = '/usr/local/bin/non-existent-tool';
      const toolConfig: ToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'manual',
        installParams: {
          binaryPath: manualBinaryPath,
        },
      };
      const context = {
        toolName: mockToolName,
        installDir: path.join(testDirs.paths.binariesDir, mockToolName),
      };
      const result = await installer.installManually(mockToolName, toolConfig, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Binary not found');
    });
  });
});
