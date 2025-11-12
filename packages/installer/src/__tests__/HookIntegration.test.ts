import { beforeEach, describe, expect, it } from 'bun:test';
import assert from 'node:assert';
import path from 'node:path';
import type { AsyncInstallHook, EnhancedInstallHookContext } from '@dotfiles/core';
import type { GithubReleaseToolConfig } from '@dotfiles/installer-github';
import { createInstallerTestSetup, type InstallerTestSetup, setupFileSystemMocks } from './installer-test-helpers';

/**
 * Integration tests demonstrating real-world hook usage scenarios
 */
describe('Hook Integration Tests', () => {
  let setup: InstallerTestSetup;

  beforeEach(async () => {
    setup = await createInstallerTestSetup();
    setupFileSystemMocks(setup);
  });

  describe('Real-world hook scenarios', () => {
    it('should handle configuration setup hook that creates config files', async () => {
      // Override the GitHub client mock for this specific test
      setup.mocks.getLatestRelease.mockResolvedValueOnce({
        id: 123,
        tag_name: '1.0.0',
        name: 'Test Release',
        draft: false,
        prerelease: false,
        created_at: '2023-01-01T00:00:00Z',
        published_at: '2023-01-01T00:00:00Z',
        assets: [
          {
            name: 'example-tool-darwin-arm64.tar.gz',
            browser_download_url:
              'https://github.com/example/tool/releases/download/v1.0.0/example-tool-darwin-arm64.tar.gz',
            size: 1000,
            content_type: 'application/gzip',
            state: 'uploaded',
            download_count: 100,
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
          },
        ],
        html_url: 'https://github.com/example/tool/releases/tag/1.0.0',
      });

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
            }) as AsyncInstallHook,
          },
        },
      };

      const result = await setup.installer.install('example-tool', toolConfig);

      expect(result.success).toBe(true);
      if (!result.success) {
        throw new Error(`Installation failed: ${result.error}`);
      }

      // Find the actual timestamped directory
      const toolDir = `${setup.testDirs.paths.binariesDir}/example-tool`;
      const toolDirContents = await setup.fs.readdir(toolDir);
      const timestampDir = toolDirContents.find((name) => name.match(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/));
      expect(timestampDir).toBeDefined();

      // Verify hook created the expected files and directories
      const configDir = path.join(toolDir, timestampDir!, 'config');
      const configFile = path.join(configDir, 'default.yaml');

      // Verify config directory was created
      expect(await setup.fs.exists(configDir)).toBe(true);

      // Verify config file was created with correct content
      expect(await setup.fs.exists(configFile)).toBe(true);
      const configContent = await setup.fs.readFile(configFile, 'utf-8');
      expect(configContent).toContain('Default configuration for example-tool');
      expect(configContent).toContain(`install_dir: ${path.join(toolDir, timestampDir!)}`);
    });

    it('should handle post-extraction binary organization hook', async () => {
      // Override the GitHub client mock for this specific test
      setup.mocks.getLatestRelease.mockResolvedValueOnce({
        id: 123,
        tag_name: '1.0.0',
        name: 'Test Release',
        draft: false,
        prerelease: false,
        created_at: '2023-01-01T00:00:00Z',
        published_at: '2023-01-01T00:00:00Z',
        assets: [
          {
            name: 'multi-binary-tool-darwin-arm64.tar.gz',
            browser_download_url:
              'https://github.com/example/multi-binary-tool/releases/download/v1.0.0/multi-binary-tool-darwin-arm64.tar.gz',
            size: 1000,
            content_type: 'application/gzip',
            state: 'uploaded',
            download_count: 100,
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
          },
        ],
        html_url: 'https://github.com/example/multi-binary-tool/releases/tag/1.0.0',
      });

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

              // Create the expected binaries from the extracted tool
              const srcPath = path.join(context.extractDir, 'tool');
              for (const binaryName of ['main-tool', 'helper-tool']) {
                const destPath = path.join(binDir, binaryName);
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
            }) as AsyncInstallHook,
          },
        },
      };

      const result = await setup.installer.install('multi-binary-tool', toolConfig);

      if (!result.success) {
        throw new Error(`Installation failed: ${result.error}`);
      }
      expect(result.success).toBe(true);

      // Find the actual timestamped directory
      const toolDir = `${setup.testDirs.paths.binariesDir}/multi-binary-tool`;

      // Debug: Check if tool directory exists
      const toolDirExists = await setup.fs.exists(toolDir);
      if (!toolDirExists) {
        throw new Error(`Tool directory does not exist: ${toolDir}`);
      }

      const toolDirContents = await setup.fs.readdir(toolDir);

      const timestampDir = toolDirContents.find((name) => name.match(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/));
      if (!timestampDir) {
        throw new Error(`No timestamp directory found in: ${toolDirContents}`);
      }

      // Verify hook created the expected directory structure
      const timestampedPath = `${toolDir}/${timestampDir}`;
      const binDir = path.join(timestampedPath, 'bin');
      const docsDir = path.join(timestampedPath, 'docs');
      const mainToolBinary = path.join(binDir, 'main-tool');
      const helperToolBinary = path.join(binDir, 'helper-tool');

      // Verify directories were created
      expect(await setup.fs.exists(binDir)).toBe(true);
      expect(await setup.fs.exists(docsDir)).toBe(true);

      // Verify executables were created in bin directory
      expect(await setup.fs.exists(mainToolBinary)).toBe(true);
      expect(await setup.fs.exists(helperToolBinary)).toBe(true);

      // Verify documentation files were copied to docs directory
      const readmeFile = path.join(docsDir, 'README.md');
      const licenseFile = path.join(docsDir, 'LICENSE');
      expect(await setup.fs.exists(readmeFile)).toBe(true);
      expect(await setup.fs.exists(licenseFile)).toBe(true);
    });

    it('should handle build/compile hook that processes source code', async () => {
      // Override the GitHub client mock for this specific test
      setup.mocks.getLatestRelease.mockResolvedValueOnce({
        id: 123,
        tag_name: '1.0.0',
        name: 'Test Release',
        draft: false,
        prerelease: false,
        created_at: '2023-01-01T00:00:00Z',
        published_at: '2023-01-01T00:00:00Z',
        assets: [
          {
            name: 'source-tool-darwin-arm64.tar.gz',
            browser_download_url:
              'https://github.com/example/source-tool/releases/download/v1.0.0/source-tool-darwin-arm64.tar.gz',
            size: 1000,
            content_type: 'application/gzip',
            state: 'uploaded',
            download_count: 100,
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
          },
        ],
        html_url: 'https://github.com/example/source-tool/releases/tag/1.0.0',
      });

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
                // In a real scenario, this would run: make PREFIX=${context.installDir} install
                // For this test, we'll simulate the process

                // Create the binary in the extract directory so the binary setup service can find it
                const binaryPath = path.join(context.extractDir, context.toolName);
                await context.fileSystem.writeFile(binaryPath, '#!/bin/bash\necho "Compiled binary"');
                await context.fileSystem.chmod(binaryPath, 0o755);

                // Create additional compiled artifacts
                const libDir = path.join(context.installDir, 'lib');
                await context.fileSystem.ensureDir(libDir);

                const libPath = path.join(libDir, 'libsource-tool.so');
                await context.fileSystem.writeFile(libPath, 'compiled library content');
              } else {
              }
            }) as AsyncInstallHook,
          },
        },
      };

      const result = await setup.installer.install('source-tool', toolConfig);

      expect(result.success).toBe(true);

      // Find the actual timestamped directory
      const toolDir = `${setup.testDirs.paths.binariesDir}/source-tool`;
      const toolDirContents = await setup.fs.readdir(toolDir);
      const timestampDir = toolDirContents.find((name) => name.match(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/));
      expect(timestampDir).toBeDefined();

      // Verify hook performed the expected build operations
      const libDir = path.join(toolDir, timestampDir!, 'lib');
      const libFile = path.join(libDir, 'libsource-tool.so');

      // Verify library directory was created
      expect(await setup.fs.exists(libDir)).toBe(true);

      // Verify shared library was created
      expect(await setup.fs.exists(libFile)).toBe(true);
    });

    it('should handle hook failure gracefully with detailed error information', async () => {
      // Override the GitHub client mock for this specific test
      setup.mocks.getLatestRelease.mockResolvedValueOnce({
        id: 123,
        tag_name: '1.0.0',
        name: 'Test Release',
        draft: false,
        prerelease: false,
        created_at: '2023-01-01T00:00:00Z',
        published_at: '2023-01-01T00:00:00Z',
        assets: [
          {
            name: 'failing-tool-darwin-arm64.tar.gz',
            browser_download_url:
              'https://github.com/example/failing-tool/releases/download/v1.0.0/failing-tool-darwin-arm64.tar.gz',
            size: 1000,
            content_type: 'application/gzip',
            state: 'uploaded',
            download_count: 100,
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z',
          },
        ],
        html_url: 'https://github.com/example/failing-tool/releases/tag/1.0.0',
      });

      const toolConfig: GithubReleaseToolConfig = {
        name: 'failing-tool',
        binaries: ['failing-tool'],
        version: 'latest',
        installationMethod: 'github-release',
        installParams: {
          repo: 'example/failing-tool',
          hooks: {
            afterDownload: (async (_context) => {
              throw new Error('Downloaded file validation failed: checksum mismatch');
            }) as AsyncInstallHook,
          },
        },
      };

      const result = await setup.installer.install('failing-tool', toolConfig);

      expect(result.success).toBe(false);
      assert(!result.success);
      expect(result.error).toContain('afterDownload hook failed');
      expect(result.error).toContain('Downloaded file validation failed: checksum mismatch');

      // Verify that the hook failure was logged appropriately
      setup.logger.expect(
        ['ERROR'],
        ['HookExecutor', 'executeHook'],
        ['Installation failed [afterDownload hook] for tool "failing-tool"']
      );
    });
  });
});
