import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import assert from 'node:assert';
import type { IFileSystem } from '@dotfiles/file-system';
import type { GithubReleaseToolConfig } from '@dotfiles/installer-github';
import type { Installer } from '../Installer';
import { createInstallerTestSetup } from './installer-test-helpers';

describe('Installer - Enhanced Hooks', () => {
  let installer: Installer;

  const mockToolName = 'test-tool';
  const mockToolVersion = '1.0.0';
  const mockToolRepo = 'owner/test-tool';

  beforeEach(async () => {
    const setup = await createInstallerTestSetup();
    installer = setup.installer;
  });

  describe('beforeInstall hook', () => {
    it('should execute beforeInstall hook with enhanced context', async () => {
      const beforeInstallHook = mock(async (context) => {
        expect(context.toolName).toBe(mockToolName);
        expect(context.fileSystem).toBeDefined();
        expect(context.stagingDir).toContain(mockToolName);
      });

      const toolConfig: GithubReleaseToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          hooks: {
            'before-install': [beforeInstallHook],
          },
        },
      };

      const result = await installer.install(mockToolName, toolConfig);

      if (!result.success) {
        throw new Error(`Hook test failed: ${result.error}`);
      }

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
            'before-install': [beforeInstallHook],
          },
        },
      };

      const result = await installer.install(mockToolName, toolConfig);

      expect(result.success).toBe(false);
      assert(!result.success);
      expect(result.error).toContain('beforeInstall hook failed');
      expect(result.error).toContain(errorMessage);
    });

    it('should handle beforeInstall hook timeout', async () => {
      const beforeInstallHook = mock(async () => {
        // This hook will be intercepted by our spy
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Spy on the hookExecutor to simulate timeout
      const executeSpy = spyOn(installer.hookExecutor, 'executeHook').mockResolvedValue({
        success: false,
        error: 'Hook before-install timed out after 50ms',
        skipped: true,
        durationMs: 50,
      });

      const toolConfig: GithubReleaseToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          hooks: {
            'before-install': [beforeInstallHook],
          },
        },
      };

      const result = await installer.install(mockToolName, toolConfig);

      assert(!result.success);
      expect(result.error).toContain('beforeInstall hook failed');
      expect(result.error).toContain('timed out');

      executeSpy.mockRestore();
    });
  });

  describe('afterInstall hook', () => {
    it('should execute afterInstall hook with enhanced context including installation result', async () => {
      const afterInstallHook = mock(async (context) => {
        expect(context.toolName).toBe(mockToolName);
        expect(context.binaryPaths[0]).toBeDefined();
        expect(context.version).toBe(mockToolVersion);
        expect(context.fileSystem).toBeDefined();
      });

      const toolConfig: GithubReleaseToolConfig = {
        name: mockToolName,
        binaries: [mockToolName],
        version: mockToolVersion,
        installationMethod: 'github-release',
        installParams: {
          repo: mockToolRepo,
          hooks: {
            'after-install': [afterInstallHook],
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
            'after-install': [afterInstallHook],
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
            'after-download': [afterDownloadHook],
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
            'after-download': [afterDownloadHook],
          },
        },
      };

      const result = await installer.install(mockToolName, toolConfig);

      expect(result.success).toBe(false);
      assert(!result.success);
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
            'after-extract': [afterExtractHook],
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
            'after-extract': [afterExtractHook],
          },
        },
      };

      const result = await installer.install(mockToolName, toolConfig);

      expect(result.success).toBe(false);
      assert(!result.success);
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
            'before-install': [beforeInstallHook],
            'after-download': [afterDownloadHook],
            'after-extract': [afterExtractHook],
            'after-install': [afterInstallHook],
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
            'before-install': [beforeInstallHook],
            'after-download': [afterDownloadHook],
            'after-extract': [afterExtractHook],
            'after-install': [afterInstallHook],
          },
        },
      };

      const result = await installer.install(mockToolName, toolConfig);

      expect(result.success).toBe(false);
      // Should stop at afterDownload and not execute afterExtract or afterInstall
      expect(executionOrder).toEqual(['beforeInstall', 'afterDownload']);
    });
  });

  describe('hook context filesystem operations', () => {
    it('should allow hooks to perform filesystem operations that are tracked', async () => {
      let capturedFileSystem: IFileSystem | undefined;

      const afterExtractHook = mock(async (context) => {
        capturedFileSystem = context.fileSystem;
        // Simulate hook performing filesystem operations
        await context.fileSystem.ensureDir('/test');
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
            'after-extract': [afterExtractHook],
          },
        },
      };

      const result = await installer.install(mockToolName, toolConfig);

      expect(result.success).toBe(true);
      expect(capturedFileSystem).toBeDefined();
      expect(capturedFileSystem!.ensureDir).toHaveBeenCalledWith('/test');
      expect(capturedFileSystem!.writeFile).toHaveBeenCalledWith('/test/hook-file.txt', 'hook content');
      expect(capturedFileSystem!.chmod).toHaveBeenCalledWith('/test/hook-file.txt', 0o755);
    });
  });
});
