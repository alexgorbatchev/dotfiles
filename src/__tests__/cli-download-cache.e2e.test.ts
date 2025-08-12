import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import * as path from 'node:path';
import { NodeFileSystem } from '@modules/file-system';
import {
  createFile,
  createMockGitHubServer,
  createMockYamlConfig,
  createTestDirectories,
  createToolConfig,
  executeCliCommand,
  type MockGitHubServerResult,
  type TestDirectories,
  TestLogger,
} from '@testing-helpers';

describe('E2E: Download Cache', () => {
  describe('cache validation with repeated installs', () => {
    let testDirs: TestDirectories;
    let fs: NodeFileSystem;
    let mockServer: MockGitHubServerResult;

    const mockToolName = 'cached-binary-tool';
    const mockToolVersion = '1.0.0';
    const mockAssetFileName = `${mockToolName}-v${mockToolVersion}-linux-amd64`;
    const mockBinaryContent = `#!/bin/sh\necho "Cached Binary Tool v${mockToolVersion}"`;

    beforeAll(async () => {
      fs = new NodeFileSystem();
      const logger = new TestLogger();
      testDirs = await createTestDirectories(logger, fs, { testName: 'cli-download-cache' });

      const localMockBinaryFilePath = await createFile(
        fs,
        path.join(testDirs.paths.homeDir, mockAssetFileName),
        mockBinaryContent,
        true
      );

      // Mock server that tracks download requests
      mockServer = await createMockGitHubServer({
        apiPaths: [
          {
            path: `/repos/mock-owner/cached-binary-repo/releases/tags/v${mockToolVersion}`,
            response: {
              tag_name: `v${mockToolVersion}`,
              assets: [
                {
                  name: mockAssetFileName,
                  browser_download_url: `/${mockAssetFileName}`,
                  size: mockBinaryContent.length,
                  content_type: 'application/octet-stream',
                },
              ],
            },
          },
          {
            path: `/repos/mock-owner/cached-binary-repo/releases/latest`,
            response: {
              tag_name: `v${mockToolVersion}`,
              assets: [
                {
                  name: mockAssetFileName,
                  browser_download_url: `/${mockAssetFileName}`,
                  size: mockBinaryContent.length,
                  content_type: 'application/octet-stream',
                },
              ],
            },
          },
        ],
        binaryPaths: [
          {
            path: `/${mockAssetFileName}`,
            filePath: localMockBinaryFilePath,
          },
        ],
      });

      // Create config with cache enabled
      const configFilePath = path.join(testDirs.paths.dotfilesDir, 'config.yaml');
      await createMockYamlConfig({
        config: {
          paths: testDirs.paths,
          github: {
            host: mockServer.baseUrl,
          },
          downloader: {
            timeout: 30000,
            retryCount: 1,
            retryDelay: 1000,
            cache: {
              enabled: true,
              ttl: 60000, // 1 minute for testing
            },
          },
          userConfigPath: configFilePath,
        },
        filePath: configFilePath,
        fileSystem: fs,
        logger: new TestLogger(),
        systemInfo: {
          platform: 'linux',
          arch: 'amd64',
          homeDir: testDirs.paths.homeDir,
        },
        env: {},
      });

      createToolConfig({
        toolConfigsDir: testDirs.paths.toolConfigsDir,
        name: mockToolName,
        fixturePath: path.resolve(__dirname, 'fixtures', 'cached-binary-tool.tool.ts'),
      });
    });

    afterAll(async () => {
      await mockServer.close();
    });

    it('should create cache directory and cache files during install', async () => {
      const cacheDir = path.join(testDirs.paths.generatedDir, 'cache', 'downloads');

      // Ensure cache dir doesn't exist initially
      if (await fs.exists(cacheDir)) {
        await fs.rm(cacheDir, { recursive: true, force: true });
      }

      // Remove any existing binary to force fresh install
      const binaryPath = path.join(testDirs.paths.binariesDir, mockToolName, mockToolVersion, mockToolName);
      if (await fs.exists(binaryPath)) {
        await fs.rm(binaryPath, { force: true });
      }

      // Install tool - should create cache
      const result = executeCliCommand({
        command: ['install', mockToolName, '--config', 'config.yaml'],
        cwd: testDirs.paths.dotfilesDir,
        homeDir: testDirs.paths.homeDir,
      });

      expect(result.exitCode).toEqual(0);

      // Verify binary was installed
      expect(await fs.exists(binaryPath)).toBe(true);

      // Verify cache directory was created
      expect(await fs.exists(cacheDir)).toBe(true);

      // Verify cache structure was created (metadata and binaries directories)
      const metadataDir = path.join(cacheDir, 'metadata');
      const binariesDir = path.join(cacheDir, 'binaries');
      expect(await fs.exists(metadataDir)).toBe(true);
      expect(await fs.exists(binariesDir)).toBe(true);

      // Verify metadata files were created
      const metadataFiles = await fs.readdir(metadataDir);
      expect(metadataFiles.length).toBeGreaterThan(0);

      // Metadata files should be JSON files
      const jsonMetadataFiles = metadataFiles.filter((file) => file.endsWith('.json'));
      expect(jsonMetadataFiles.length).toBeGreaterThan(0);

      // Verify binary files were created
      const binaryFiles = await fs.readdir(binariesDir);
      expect(binaryFiles.length).toBeGreaterThan(0);
    });

    it('should have valid cache files with correct structure', async () => {
      const cacheDir = path.join(testDirs.paths.generatedDir, 'cache', 'downloads');
      expect(await fs.exists(cacheDir)).toBe(true);

      const metadataDir = path.join(cacheDir, 'metadata');
      const binariesDir = path.join(cacheDir, 'binaries');

      const metadataFiles = await fs.readdir(metadataDir);
      expect(metadataFiles.length).toBeGreaterThan(0);

      // Check first metadata file structure
      const firstMetadataFile = metadataFiles.find((file) => file.endsWith('.json'));
      expect(firstMetadataFile).toBeDefined();

      if (firstMetadataFile) {
        const metadataContent = await fs.readFile(path.join(metadataDir, firstMetadataFile), 'utf8');
        const cacheEntry = JSON.parse(metadataContent);

        // Verify cache entry structure for the new FileCache
        expect(cacheEntry).toHaveProperty('data');
        expect(cacheEntry).toHaveProperty('metadata');
        expect(cacheEntry).toHaveProperty('timestamp');
        expect(cacheEntry).toHaveProperty('expiresAt');

        expect(typeof cacheEntry.data).toBe('string'); // Binary filename
        expect(typeof cacheEntry.metadata).toBe('object');
        expect(typeof cacheEntry.timestamp).toBe('number');
        expect(typeof cacheEntry.expiresAt).toBe('number');
        expect(cacheEntry.expiresAt).toBeGreaterThan(cacheEntry.timestamp);

        // Check metadata structure
        expect(cacheEntry.metadata).toHaveProperty('url');
        expect(cacheEntry.metadata).toHaveProperty('size');
        expect(cacheEntry.metadata).toHaveProperty('binaryFilePath');
        expect(cacheEntry.metadata).toHaveProperty('contentHash');

        expect(typeof cacheEntry.metadata.url).toBe('string');
        expect(typeof cacheEntry.metadata.size).toBe('number');
        expect(typeof cacheEntry.metadata.binaryFilePath).toBe('string');
        expect(typeof cacheEntry.metadata.contentHash).toBe('string');

        // Verify the binary file exists
        const binaryPath = path.join(binariesDir, cacheEntry.metadata.binaryFilePath);
        expect(await fs.exists(binaryPath)).toBe(true);
      }
    });

    it('should work when cache is disabled', async () => {
      // Create config with cache DISABLED
      const configFilePath = path.join(testDirs.paths.dotfilesDir, 'config.yaml');
      await createMockYamlConfig({
        config: {
          paths: testDirs.paths,
          github: {
            host: mockServer.baseUrl,
          },
          downloader: {
            timeout: 30000,
            retryCount: 1,
            retryDelay: 1000,
            cache: {
              enabled: false, // Disabled!
              ttl: 60000,
            },
          },
          userConfigPath: configFilePath,
        },
        filePath: configFilePath,
        fileSystem: fs,
        logger: new TestLogger(),
        systemInfo: {
          platform: 'linux',
          arch: 'amd64',
          homeDir: testDirs.paths.homeDir,
        },
        env: {},
      });

      // Remove binary to force fresh install
      const expectedBinaryPath = path.join(testDirs.paths.binariesDir, mockToolName, mockToolVersion, mockToolName);
      if (await fs.exists(expectedBinaryPath)) {
        await fs.rm(expectedBinaryPath, { force: true });
      }

      // Install with cache disabled
      const result = executeCliCommand({
        command: ['install', mockToolName, '--config', 'config.yaml'],
        cwd: testDirs.paths.dotfilesDir,
        homeDir: testDirs.paths.homeDir,
      });

      expect(result.exitCode).toEqual(0);

      // Verify binary was installed
      expect(await fs.exists(expectedBinaryPath)).toBe(true);
      const content = await fs.readFile(expectedBinaryPath, 'utf8');
      expect(content).toEqual(mockBinaryContent);
    });
  });
});
