import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { YamlConfig } from '@modules/config';
import type { DownloadOptions, IDownloader } from '@modules/downloader';
import type { ExtractOptions, IArchiveExtractor } from '@modules/extractor';
import type { IGitHubApiClient } from '@modules/github-client';
import type { TsLogger } from '@modules/logger';
import type { SafeLogMessage } from '@modules/logger/SafeLogMessage';
import { createMemFileSystem, type MemFileSystemReturn, TestLogger } from '@testing-helpers';
import type { AsyncInstallHook, EnhancedInstallHookContext, GithubReleaseToolConfig } from '@types';
import { Installer } from '../Installer';

// Helper function for tests to create SafeLogMessage
function testLogMessage(message: string): SafeLogMessage {
  return message as SafeLogMessage;
}

import path from 'node:path';

/**
 * Integration tests demonstrating real-world hook usage scenarios
 */
describe('Hook Integration Tests', () => {
  let logger: TestLogger;
  let installer: Installer;
  let memFs: MemFileSystemReturn;
  let mockDownloader: IDownloader;
  let mockGitHubClient: IGitHubApiClient;
  let mockArchiveExtractor: IArchiveExtractor;
  let mockConfig: YamlConfig;

  beforeEach(async () => {
    logger = new TestLogger();
    memFs = await createMemFileSystem();

    // Setup filesystem to track operations
    const fileSystemOperations: Array<{ operation: string; args: unknown[] }> = [];

    // Wrap filesystem operations to track them
    const originalEnsureDir = memFs.spies.ensureDir;
    const originalWriteFile = memFs.spies.writeFile;
    const originalCopyFile = memFs.spies.copyFile;
    const originalChmod = memFs.spies.chmod;

    memFs.spies.ensureDir = mock(async (path) => {
      fileSystemOperations.push({ operation: 'ensureDir', args: [path] });
      return originalEnsureDir(path);
    });

    memFs.spies.writeFile = mock(async (path, content) => {
      fileSystemOperations.push({ operation: 'writeFile', args: [path, content] });
      return originalWriteFile(path, content);
    });

    memFs.spies.copyFile = mock(async (src, dest) => {
      fileSystemOperations.push({ operation: 'copyFile', args: [src, dest] });
      return originalCopyFile(src, dest);
    });

    memFs.spies.chmod = mock(async (path, mode) => {
      fileSystemOperations.push({ operation: 'chmod', args: [path, mode] });
      return originalChmod(path, mode);
    });

    // Store operations for test assertions
    (memFs.fs as unknown as Record<string, unknown>)['operations'] = fileSystemOperations;

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
          tag_name: '1.2.3',
          html_url: 'https://github.com/example/tool/releases/tag/v1.2.3',
          published_at: '2023-01-01T00:00:00Z',
          created_at: '2023-01-01T00:00:00Z',
          name: 'Release v1.2.3',
          draft: false,
          prerelease: false,
          assets: [
            {
              id: 123,
              name: 'tool-darwin-arm64.tar.gz',
              browser_download_url: 'https://github.com/example/tool/releases/download/v1.2.3/tool-darwin-arm64.tar.gz',
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
          await memFs.fs.writeFile(`${targetDir}/tool`, 'mock-binary-content');
          await memFs.fs.writeFile(`${targetDir}/README.md`, 'mock-readme');
          await memFs.fs.writeFile(`${targetDir}/LICENSE`, 'mock-license');
        }
        return {
          extractedFiles: ['tool', 'README.md', 'LICENSE'],
          executables: ['tool'],
        };
      }),
      detectFormat: mock(),
      isSupported: mock(),
    } as IArchiveExtractor;

    mockConfig = {
      paths: {
        generatedDir: '/app/generated',
        binariesDir: '/app/generated/binaries',
      },
      github: {
        host: 'github.com',
      },
    } as YamlConfig;

    installer = new Installer(logger, memFs.fs, mockDownloader, mockGitHubClient, mockArchiveExtractor, mockConfig);
  });

  describe('Real-world hook scenarios', () => {
    it('should handle configuration setup hook that creates config files', async () => {
      const toolConfig: GithubReleaseToolConfig = {
        name: 'example-tool',
        binaries: ['tool'],
        version: 'latest',
        installationMethod: 'github-release',
        installParams: {
          repo: 'example/tool',
          hooks: {
            afterInstall: (async (context: EnhancedInstallHookContext) => {
              // Create a config directory
              const configDir = path.join(context.installDir, 'config');
              await context.fileSystem.ensureDir(configDir);

              // Create a default configuration file
              const configPath = path.join(configDir, 'default.yaml');
              const configContent = `# Default configuration for ${context.toolName}\\nversion: ${context.version}\\ninstall_dir: ${context.installDir}`;
              await context.fileSystem.writeFile(configPath, configContent);

              // Make the main binary executable with specific permissions
              if (context.binaryPath) {
                await context.fileSystem.chmod(context.binaryPath, 0o755);
              }

              context.logger.info(testLogMessage('Configuration setup completed'));
            }) as AsyncInstallHook,
          },
        },
      };

      const result = await installer.install('example-tool', toolConfig);

      expect(result.success).toBe(true);

      // Verify hook created the expected files and directories
      const configDir = '/app/generated/binaries/example-tool/latest/config';
      const configFile = '/app/generated/binaries/example-tool/latest/config/default.yaml';

      // Verify config directory was created
      expect(await memFs.fs.exists(configDir)).toBe(true);

      // Verify config file was created with correct content
      expect(await memFs.fs.exists(configFile)).toBe(true);
      const configContent = await memFs.fs.readFile(configFile, 'utf-8');
      expect(configContent).toContain('Default configuration for example-tool');
      expect(configContent).toContain('install_dir: /app/generated/binaries/example-tool/latest');
    });

    it('should handle post-extraction binary organization hook', async () => {
      const toolConfig: GithubReleaseToolConfig = {
        name: 'multi-binary-tool',
        binaries: ['main-tool', 'helper-tool'],
        version: 'latest',
        installationMethod: 'github-release',
        installParams: {
          repo: 'example/multi-binary-tool',
          hooks: {
            afterExtract: (async (context: EnhancedInstallHookContext) => {
              if (!context.extractDir || !context.extractResult) {
                throw new Error('No extraction results available');
              }

              // Organize binaries in a bin subdirectory
              const binDir = path.join(context.installDir, 'bin');
              await context.fileSystem.ensureDir(binDir);

              // Copy executables to bin directory
              for (const executable of context.extractResult.executables || []) {
                const srcPath = path.join(context.extractDir, executable);
                const destPath = path.join(binDir, executable);
                await context.fileSystem.copyFile(srcPath, destPath);
                await context.fileSystem.chmod(destPath, 0o755);
              }

              // Copy documentation files
              const docFiles = context.extractResult.extractedFiles.filter(
                (file) => file.includes('README') || file.includes('LICENSE')
              );

              if (docFiles.length > 0) {
                const docDir = path.join(context.installDir, 'docs');
                await context.fileSystem.ensureDir(docDir);

                for (const docFile of docFiles) {
                  const srcPath = path.join(context.extractDir, docFile);
                  const destPath = path.join(docDir, docFile);
                  await context.fileSystem.copyFile(srcPath, destPath);
                }
              }

              context.logger.info(testLogMessage('Binary organization completed'));
            }) as AsyncInstallHook,
          },
        },
      };

      const result = await installer.install('multi-binary-tool', toolConfig);

      expect(result.success).toBe(true);

      // Verify hook created the expected directory structure
      const binDir = '/app/generated/binaries/multi-binary-tool/latest/bin';
      const docsDir = '/app/generated/binaries/multi-binary-tool/latest/docs';
      const toolBinary = '/app/generated/binaries/multi-binary-tool/latest/bin/tool';

      // Verify directories were created
      expect(await memFs.fs.exists(binDir)).toBe(true);
      expect(await memFs.fs.exists(docsDir)).toBe(true);

      // Verify executable was copied to bin directory
      expect(await memFs.fs.exists(toolBinary)).toBe(true);

      // Verify documentation files were copied to docs directory
      const readmeFile = '/app/generated/binaries/multi-binary-tool/latest/docs/README.md';
      const licenseFile = '/app/generated/binaries/multi-binary-tool/latest/docs/LICENSE';
      expect(await memFs.fs.exists(readmeFile)).toBe(true);
      expect(await memFs.fs.exists(licenseFile)).toBe(true);
    });

    it('should handle build/compile hook that processes source code', async () => {
      const toolConfig: GithubReleaseToolConfig = {
        name: 'source-tool',
        binaries: ['source-tool'],
        version: 'latest',
        installationMethod: 'github-release',
        installParams: {
          repo: 'example/source-tool',
          hooks: {
            afterExtract: (async (context: EnhancedInstallHookContext) => {
              if (!context.extractDir) {
                throw new Error('No extraction directory available');
              }

              // Check if this is a source distribution
              const makefilePath = path.join(context.extractDir, 'Makefile');
              const hasMakefile = await context.fileSystem.exists(makefilePath);

              if (hasMakefile) {
                context.logger.info(testLogMessage('Source distribution detected, compiling...'));

                // In a real scenario, this would run: make PREFIX=${context.installDir} install
                // For this test, we'll simulate the process

                // Create the binary in the install directory
                const binaryPath = path.join(context.installDir, context.toolName);
                await context.fileSystem.writeFile(binaryPath, '#!/bin/bash\\necho \"Compiled binary\"');
                await context.fileSystem.chmod(binaryPath, 0o755);

                // Create additional compiled artifacts
                const libDir = path.join(context.installDir, 'lib');
                await context.fileSystem.ensureDir(libDir);

                const libPath = path.join(libDir, 'libsource-tool.so');
                await context.fileSystem.writeFile(libPath, 'compiled library content');

                context.logger.info(testLogMessage('Compilation completed successfully'));
              } else {
                context.logger.info(testLogMessage('Pre-compiled binary distribution detected'));
              }
            }) as AsyncInstallHook,
          },
        },
      };

      // Mock filesystem to simulate extracted Makefile existence
      const extractDir = '/app/generated/binaries/source-tool/latest/temp-extract';
      await memFs.fs.ensureDir(extractDir);
      await memFs.fs.writeFile(`${extractDir}/Makefile`, 'CC=gcc\nall:\n\tgcc -o source-tool source-tool.c');
      await memFs.fs.writeFile(`${extractDir}/source-tool.c`, '#include <stdio.h>\nint main() { return 0; }');

      const result = await installer.install('source-tool', toolConfig);

      expect(result.success).toBe(true);

      // Verify hook performed the expected build operations
      const libDir = '/app/generated/binaries/source-tool/latest/lib';
      const compiledBinary = '/app/generated/binaries/source-tool/latest/source-tool';
      const libFile = '/app/generated/binaries/source-tool/latest/lib/libsource-tool.so';

      // Verify library directory was created
      expect(await memFs.fs.exists(libDir)).toBe(true);

      // Verify compiled binary was created
      expect(await memFs.fs.exists(compiledBinary)).toBe(true);

      // Verify shared library was created
      expect(await memFs.fs.exists(libFile)).toBe(true);
    });

    it('should handle hook failure gracefully with detailed error information', async () => {
      const toolConfig: GithubReleaseToolConfig = {
        name: 'failing-tool',
        binaries: ['failing-tool'],
        version: 'latest',
        installationMethod: 'github-release',
        installParams: {
          repo: 'example/failing-tool',
          hooks: {
            afterDownload: (async (context) => {
              context.logger.error(testLogMessage('Validation failed'));
              throw new Error('Downloaded file validation failed: checksum mismatch');
            }) as AsyncInstallHook,
          },
        },
      };

      const result = await installer.install('failing-tool', toolConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('afterDownload hook failed');
      expect(result.error).toContain('Downloaded file validation failed: checksum mismatch');

      // Verify that the hook failure was logged appropriately
      logger.expect(
        ['ERROR'],
        ['HookExecutor'],
        [
          'Installation failed [afterDownload hook] for tool "failing-tool": Downloaded file validation failed: checksum mismatch',
        ]
      );
    });

    it('should provide hooks with proper logging context', async () => {
      let capturedLogger: TsLogger | undefined;

      const toolConfig: GithubReleaseToolConfig = {
        name: 'logging-test-tool',
        binaries: ['logging-test-tool'],
        version: 'latest',
        installationMethod: 'github-release',
        installParams: {
          repo: 'example/logging-test-tool',
          hooks: {
            afterInstall: (async (context: EnhancedInstallHookContext) => {
              capturedLogger = context.logger;
              context.logger.info(testLogMessage('Hook execution message'));
              context.logger.debug(testLogMessage('Debug information'));
              context.logger.error(testLogMessage('Error message from hook'));
            }) as AsyncInstallHook,
          },
        },
      };

      const result = await installer.install('logging-test-tool', toolConfig);

      expect(result.success).toBe(true);
      expect(capturedLogger).toBeDefined();

      // Verify that hook was executed with proper logger context
      expect(capturedLogger).toBeDefined();
      // Check if logger has proper context (logger structure may vary)
      // The new naming format is toolName--hookName
      if (capturedLogger) {
        const logger = capturedLogger as unknown as Record<string, unknown>;
        const loggerName = logger['settings'] as Record<string, unknown> | undefined;
        expect(loggerName?.['name'] || logger['_name'] || logger['name']).toMatch(/logging-test-tool--afterInstall/);
      }

      // Verify hook execution completed
    });
  });
});
