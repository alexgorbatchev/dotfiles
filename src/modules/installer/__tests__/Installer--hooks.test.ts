import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import type { YamlConfig } from '@modules/config';
import type { DownloadOptions, IDownloader } from '@modules/downloader';
import type { IArchiveExtractor } from '@modules/extractor';
import type { IFileSystem } from '@modules/file-system';
import type { IGitHubApiClient } from '@modules/github-client';
import { createMemFileSystem, type MemFileSystemReturn, TestLogger } from '@testing-helpers';
import type { ExtractOptions, GithubReleaseToolConfig } from '@types';
import { Installer } from '../Installer';
import { createMockToolInstallationRegistry } from './installer-test-helpers';

describe('Installer - Enhanced Hooks', () => {
  let logger: TestLogger;
  let installer: Installer;
  let memFs: MemFileSystemReturn;
  let mockDownloader: IDownloader;
  let mockGitHubClient: IGitHubApiClient;
  let mockArchiveExtractor: IArchiveExtractor;
  let mockConfig: YamlConfig;

  const mockToolName = 'test-tool';
  const mockToolVersion = '1.0.0';
  const mockToolRepo = 'owner/test-tool';

  beforeEach(async () => {
    logger = new TestLogger();
    memFs = await createMemFileSystem();

    mockDownloader = {
      download: mock(async (_url: string, options?: DownloadOptions) => {
        // Mock the actual download by creating the destination file
        if (options?.destinationPath) {
          await memFs.fs.writeFile(options.destinationPath, 'mock-downloaded-file-content');
        }
      }),
      registerStrategy: mock(),
      downloadToFile: mock(),
    } as IDownloader;

    mockGitHubClient = {
      getLatestRelease: mock(() =>
        Promise.resolve({
          id: 12345,
          tag_name: mockToolVersion,
          html_url: 'https://github.com/owner/test-tool/releases/tag/v1.0.0',
          published_at: '2023-01-01T00:00:00Z',
          created_at: '2023-01-01T00:00:00Z',
          name: 'Release v1.0.0',
          draft: false,
          prerelease: false,
          assets: [
            {
              id: 123,
              name: 'test-tool-darwin-arm64.tar.gz',
              browser_download_url:
                'https://github.com/owner/test-tool/releases/download/v1.0.0/test-tool-darwin-arm64.tar.gz',
              size: 1024000,
              content_type: 'application/gzip',
              state: 'uploaded',
              download_count: 42,
              created_at: '2023-01-01T00:00:00Z',
              updated_at: '2023-01-01T00:00:00Z',
            },
          ],
        })
      ),
      getReleaseByTag: mock(),
      getAllReleases: mock(),
      getReleaseByConstraint: mock(),
      getRateLimit: mock(),
    } as IGitHubApiClient;

    mockArchiveExtractor = {
      extract: mock(async (_archivePath: string, options?: ExtractOptions) => {
        // Mock the extraction by creating extracted files in the target directory
        const targetDir = options?.targetDir;
        if (targetDir) {
          await memFs.fs.ensureDir(targetDir);
          await memFs.fs.writeFile(`${targetDir}/test-tool`, 'mock-binary-content');
        }
        return {
          extractedFiles: ['test-tool'],
          executables: ['test-tool'],
        };
      }),
      detectFormat: mock(),
      isSupported: mock(),
    } as IArchiveExtractor;

    mockConfig = {
      paths: {
        generatedDir: '/test/generated',
        binariesDir: '/test/generated/binaries',
      },
      github: {
        host: 'github.com',
      },
    } as YamlConfig;

    installer = new Installer(
      logger,
      memFs.fs,
      mockDownloader,
      mockGitHubClient,
      mockArchiveExtractor,
      mockConfig,
      createMockToolInstallationRegistry()
    );
  });

  describe('beforeInstall hook', () => {
    it('should execute beforeInstall hook with enhanced context', async () => {
      const beforeInstallHook = mock(async (context) => {
        expect(context.toolName).toBe(mockToolName);
        expect(context.fileSystem).toBeDefined();
        expect(context.logger).toBeDefined();
        expect(context.installDir).toContain(mockToolName);
      });

      const toolConfig: GithubReleaseToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          hooks: {
            beforeInstall: beforeInstallHook,
          },
        },
      };

      const result = await installer.install(mockToolName, toolConfig);

      expect(result.success).toBe(true);
      expect(beforeInstallHook).toHaveBeenCalledTimes(1);
    });

    it('should fail installation if beforeInstall hook fails', async () => {
      const errorMessage = 'beforeInstall hook failed';
      const beforeInstallHook = mock(async () => {
        throw new Error(errorMessage);
      });

      const toolConfig: GithubReleaseToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          hooks: {
            beforeInstall: beforeInstallHook,
          },
        },
      };

      const result = await installer.install(mockToolName, toolConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('beforeInstall hook failed');
      expect(result.error).toContain(errorMessage);
    });

    it('should handle beforeInstall hook timeout', async () => {
      const beforeInstallHook = mock(async () => {
        // Simulate a slow hook
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const toolConfig: GithubReleaseToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          hooks: {
            beforeInstall: beforeInstallHook,
          },
        },
      };

      // Testing private hookExecutor property - legitimate test access to internal implementation
      // biome-ignore lint/suspicious/noExplicitAny: Testing private property access
      const hookExecutorSpy = spyOn((installer as any)['hookExecutor'], 'executeHook').mockResolvedValue({
        success: false,
        error: 'Hook timed out after 50ms',
        durationMs: 50,
        skipped: false,
      });

      const result = await installer.install(mockToolName, toolConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('beforeInstall hook failed');
      expect(result.error).toContain('timed out');

      hookExecutorSpy.mockRestore();
    });
  });

  describe('afterInstall hook', () => {
    it('should execute afterInstall hook with enhanced context including installation result', async () => {
      const afterInstallHook = mock(async (context) => {
        expect(context.toolName).toBe(mockToolName);
        expect(context.binaryPath).toBeDefined();
        expect(context.version).toBe(mockToolVersion);
        expect(context.fileSystem).toBeDefined();
        expect(context.logger).toBeDefined();
      });

      const toolConfig: GithubReleaseToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          hooks: {
            afterInstall: afterInstallHook,
          },
        },
      };

      const result = await installer.install(mockToolName, toolConfig);

      expect(result.success).toBe(true);
      expect(afterInstallHook).toHaveBeenCalledTimes(1);
    });

    it('should continue installation if afterInstall hook fails (continueOnError=true)', async () => {
      const errorMessage = 'afterInstall hook failed';
      const afterInstallHook = mock(async () => {
        throw new Error(errorMessage);
      });

      const toolConfig: GithubReleaseToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          hooks: {
            afterInstall: afterInstallHook,
          },
        },
      };

      const result = await installer.install(mockToolName, toolConfig);

      // Installation should still succeed despite afterInstall hook failure
      expect(result.success).toBe(true);
    });
  });

  describe('afterDownload hook', () => {
    it('should execute afterDownload hook with download path in context', async () => {
      const afterDownloadHook = mock(async (context) => {
        expect(context.toolName).toBe(mockToolName);
        expect(context.downloadPath).toBeDefined();
        expect(context.downloadPath).toContain('test-tool-darwin-arm64.tar.gz');
        expect(context.fileSystem).toBeDefined();
        expect(context.logger).toBeDefined();
      });

      const toolConfig: GithubReleaseToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          hooks: {
            afterDownload: afterDownloadHook,
          },
        },
      };

      const result = await installer.install(mockToolName, toolConfig);

      expect(result.success).toBe(true);
      expect(afterDownloadHook).toHaveBeenCalledTimes(1);
    });

    it('should fail installation if afterDownload hook fails', async () => {
      const errorMessage = 'afterDownload hook failed';
      const afterDownloadHook = mock(async () => {
        throw new Error(errorMessage);
      });

      const toolConfig: GithubReleaseToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          hooks: {
            afterDownload: afterDownloadHook,
          },
        },
      };

      const result = await installer.install(mockToolName, toolConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('afterDownload hook failed');
      expect(result.error).toContain(errorMessage);
    });
  });

  describe('afterExtract hook', () => {
    it('should execute afterExtract hook with extract results in context', async () => {
      const afterExtractHook = mock(async (context) => {
        expect(context.toolName).toBe(mockToolName);
        expect(context.extractDir).toBeDefined();
        expect(context.extractResult).toBeDefined();
        expect(context.extractResult.extractedFiles).toContain('test-tool');
        expect(context.extractResult.executables).toContain('test-tool');
        expect(context.fileSystem).toBeDefined();
        expect(context.logger).toBeDefined();
      });

      const toolConfig: GithubReleaseToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          hooks: {
            afterExtract: afterExtractHook,
          },
        },
      };

      const result = await installer.install(mockToolName, toolConfig);

      expect(result.success).toBe(true);
      expect(afterExtractHook).toHaveBeenCalledTimes(1);
    });

    it('should fail installation if afterExtract hook fails', async () => {
      const errorMessage = 'afterExtract hook failed';
      const afterExtractHook = mock(async () => {
        throw new Error(errorMessage);
      });

      const toolConfig: GithubReleaseToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          hooks: {
            afterExtract: afterExtractHook,
          },
        },
      };

      const result = await installer.install(mockToolName, toolConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('afterExtract hook failed');
      expect(result.error).toContain(errorMessage);
    });
  });

  describe('multiple hooks execution', () => {
    it('should execute all hooks in correct order', async () => {
      const executionOrder: string[] = [];

      const beforeInstallHook = mock(async () => {
        executionOrder.push('beforeInstall');
      });

      const afterDownloadHook = mock(async () => {
        executionOrder.push('afterDownload');
      });

      const afterExtractHook = mock(async () => {
        executionOrder.push('afterExtract');
      });

      const afterInstallHook = mock(async () => {
        executionOrder.push('afterInstall');
      });

      const toolConfig: GithubReleaseToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          hooks: {
            beforeInstall: beforeInstallHook,
            afterDownload: afterDownloadHook,
            afterExtract: afterExtractHook,
            afterInstall: afterInstallHook,
          },
        },
      };

      const result = await installer.install(mockToolName, toolConfig);

      expect(result.success).toBe(true);
      expect(executionOrder).toEqual(['beforeInstall', 'afterDownload', 'afterExtract', 'afterInstall']);
    });

    it('should stop execution if critical hook fails (beforeInstall, afterDownload, afterExtract)', async () => {
      const executionOrder: string[] = [];

      const beforeInstallHook = mock(async () => {
        executionOrder.push('beforeInstall');
      });

      const afterDownloadHook = mock(async () => {
        executionOrder.push('afterDownload');
        throw new Error('afterDownload failed');
      });

      const afterExtractHook = mock(async () => {
        executionOrder.push('afterExtract');
      });

      const afterInstallHook = mock(async () => {
        executionOrder.push('afterInstall');
      });

      const toolConfig: GithubReleaseToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          hooks: {
            beforeInstall: beforeInstallHook,
            afterDownload: afterDownloadHook,
            afterExtract: afterExtractHook,
            afterInstall: afterInstallHook,
          },
        },
      };

      const result = await installer.install(mockToolName, toolConfig);

      expect(result.success).toBe(false);
      // Should stop at afterDownload and not execute afterExtract, but afterInstall may still run for cleanup
      expect(executionOrder).toEqual(['beforeInstall', 'afterDownload', 'afterInstall']);
    });
  });

  describe('hook context filesystem operations', () => {
    it('should allow hooks to perform filesystem operations that are tracked', async () => {
      let capturedFileSystem: IFileSystem | undefined;

      const afterExtractHook = mock(async (context) => {
        capturedFileSystem = context.fileSystem;
        // Simulate hook performing filesystem operations
        await context.fileSystem.writeFile('/test/hook-file.txt', 'hook content');
        await context.fileSystem.chmod('/test/hook-file.txt', 0o755);
      });

      const toolConfig: GithubReleaseToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          hooks: {
            afterExtract: afterExtractHook,
          },
        },
      };

      const result = await installer.install(mockToolName, toolConfig);

      expect(result.success).toBe(true);
      expect(capturedFileSystem).toBeDefined();
      expect(capturedFileSystem!.writeFile).toHaveBeenCalledWith('/test/hook-file.txt', 'hook content');
      expect(capturedFileSystem!.chmod).toHaveBeenCalledWith('/test/hook-file.txt', 0o755);
    });
  });
});
