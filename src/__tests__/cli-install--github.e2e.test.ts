import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import * as path from 'node:path';
import { NodeFileSystem } from '@modules/file-system';
import {
  createFile,
  createMockApiServer,
  createMockYamlConfig,
  createTestDirectories,
  createToolConfig,
  executeCliCommand,
  type MockGitHubServerResult,
  type TestDirectories,
  TestLogger,
} from '@testing-helpers';
import { $ } from 'zx';

describe('E2E: cli install (GitHub)', () => {
  describe('downloaded direct binary', () => {
    let localMockBinaryFilePath: string;
    let expectedInstalledBinaryPath: string;
    let testDirs: TestDirectories;
    let fs: NodeFileSystem;
    let mockServer: MockGitHubServerResult;

    const mockToolName = 'mock-direct-binary-tool';
    const mockToolVersion = '1.0.0';
    const mockAssetFileName = `${mockToolName}-v${mockToolVersion}-linux-amd64`;
    const mockBinaryContent = `#!/bin/sh\necho "Mock Direct Binary Tool v${mockToolVersion}"`;

    beforeAll(async () => {
      fs = new NodeFileSystem();
      const logger = new TestLogger();
      testDirs = await createTestDirectories(logger, fs, { testName: 'cli-install-direct-binary-mock' });
      expectedInstalledBinaryPath = path.join(testDirs.paths.binariesDir, mockToolName, mockToolName);

      localMockBinaryFilePath = await createFile(
        fs,
        path.join(testDirs.paths.homeDir, mockAssetFileName),
        mockBinaryContent,
        true
      );

      mockServer = await createMockApiServer({
        apiPaths: [
          {
            path: `/repos/mock-owner/direct-binary-repo/releases/tags/v${mockToolVersion}`,
            response: {
              tag_name: `v${mockToolVersion}`,
              assets: [{ name: mockAssetFileName, browser_download_url: `/${mockAssetFileName}` }],
            },
          },
          {
            path: `/repos/mock-owner/direct-binary-repo/releases/latest`,
            response: {
              tag_name: `v${mockToolVersion}`,
              assets: [{ name: mockAssetFileName, browser_download_url: `/${mockAssetFileName}` }],
            },
          },
        ],
        binaryPaths: [{ path: `/${mockAssetFileName}`, filePath: localMockBinaryFilePath }],
      });

      const configFilePath = path.join(testDirs.paths.dotfilesDir, 'config.yaml');
      await createMockYamlConfig({
        config: {
          paths: testDirs.paths,
          github: {
            host: mockServer.baseUrl,
          },
          userConfigPath: configFilePath,
        },
        filePath: configFilePath,
        logger,
        fileSystem: fs,
        systemInfo: {
          platform: 'linux',
          arch: 'x64',
          homeDir: testDirs.paths.homeDir,
        },
        env: {},
      });

      createToolConfig({
        toolConfigsDir: testDirs.paths.toolConfigsDir,
        name: mockToolName,
        fixturePath: path.resolve(__dirname, 'fixtures', 'mock-direct-binary-tool.tool.ts'),
      });

      const result = executeCliCommand({
        command: ['install', mockToolName, '--config', 'config.yaml'],
        cwd: testDirs.paths.dotfilesDir,
        homeDir: testDirs.paths.homeDir,
      });

      expect(result.stderr).toEqual('');
      expect(result.exitCode).toEqual(0);
    });

    afterAll(async () => {
      await mockServer.close();
    });

    it('should download the binary asset to the correct location', async () => {
      expect(await fs.exists(expectedInstalledBinaryPath)).toBe(true);
    });

    it('should make the downloaded binary executable', async () => {
      expect((await fs.stat(expectedInstalledBinaryPath)).mode & 0o100).toBeGreaterThan(0);
    });

    it('should verify the downloaded file content', async () => {
      const binaryContent = await fs.readFile(expectedInstalledBinaryPath, 'utf8');
      expect(binaryContent).toEqual(mockBinaryContent);
    });

    describe('second install call', () => {
      it('should not re-download the binary when already installed', async () => {
        // Get the current binary path and its content before second install
        const binaryPath = path.join(testDirs.paths.binariesDir, mockToolName, mockToolName);
        expect(await fs.exists(binaryPath)).toBe(true);

        // Read the target of the symlink to get the actual binary file
        const symlinkTarget = await fs.readlink(binaryPath);
        const actualBinaryPath = path.resolve(path.dirname(binaryPath), symlinkTarget);

        // Get the original content
        const originalContent = await fs.readFile(actualBinaryPath, 'utf8');
        expect(originalContent).toEqual(mockBinaryContent);

        // Modify the source binary file to simulate a change on the server
        const modifiedContent = `#!/bin/sh\necho "Modified Mock Direct Binary Tool v${mockToolVersion}"`;
        await fs.writeFile(localMockBinaryFilePath, modifiedContent);

        // Wait a small amount to ensure any file operations would show different timestamps
        await new Promise((resolve) => setTimeout(resolve, 100));

        const result = executeCliCommand({
          command: ['install', mockToolName, '--config', 'config.yaml'],
          cwd: testDirs.paths.dotfilesDir,
          homeDir: testDirs.paths.homeDir,
        });

        expect(result.stderr).toEqual('');
        expect(result.exitCode).toEqual(0);

        // Verify the downloaded binary still has the original content (not the modified source)
        const finalContent = await fs.readFile(actualBinaryPath, 'utf8');
        expect(finalContent).toEqual(originalContent);
        expect(finalContent).toEqual(mockBinaryContent);
        expect(finalContent).not.toEqual(modifiedContent);

        // Verify binary is still accessible via the symlink
        expect(await fs.exists(binaryPath)).toBe(true);
      });
    });
  });

  describe('downloaded tar.gz archive', () => {
    let localArchiveFilePath: string;
    let expectedBinaryPath: string;
    let testDirs: TestDirectories;
    let fs: NodeFileSystem;
    let mockServer: MockGitHubServerResult;

    const mockArchiveToolName = 'archive-tool';
    const mockArchiveToolVersion = '1.0.0';
    const mockArchiveFileName = `${mockArchiveToolName}-v${mockArchiveToolVersion}-linux-amd64.tar.gz`;
    const mockBinaryContent = `#!/bin/sh\necho "Archive Tool v${mockArchiveToolVersion}"`;

    beforeAll(async () => {
      fs = new NodeFileSystem();
      const logger = new TestLogger();
      testDirs = await createTestDirectories(logger, fs, {
        testName: 'cli-install-archive-mock',
        additionalDirs: {
          'temp-archive-source': { path: 'temp-archive-source' },
        },
      });
      expectedBinaryPath = path.join(testDirs.paths.binariesDir, mockArchiveToolName, mockArchiveToolName);

      // Create archive with realistic directory structure
      const archiveSourceDir = path.join(
        testDirs.getDir('temp-archive-source'),
        `${mockArchiveToolName}-v${mockArchiveToolVersion}`
      );
      await fs.ensureDir(archiveSourceDir);
      await createFile(fs, path.join(archiveSourceDir, mockArchiveToolName), mockBinaryContent, true);

      localArchiveFilePath = path.join(testDirs.paths.homeDir, mockArchiveFileName);
      await $`tar -czf ${localArchiveFilePath} -C ${testDirs.getDir('temp-archive-source')} ${mockArchiveToolName}-v${mockArchiveToolVersion}`.quiet();

      mockServer = await createMockApiServer({
        apiPaths: [
          {
            path: `/repos/mock-owner/archive-repo/releases/tags/v${mockArchiveToolVersion}`,
            response: {
              tag_name: `v${mockArchiveToolVersion}`,
              assets: [{ name: mockArchiveFileName, browser_download_url: `/${mockArchiveFileName}` }],
            },
          },
          {
            path: `/repos/mock-owner/archive-repo/releases/latest`,
            response: {
              tag_name: `v${mockArchiveToolVersion}`,
              assets: [{ name: mockArchiveFileName, browser_download_url: `/${mockArchiveFileName}` }],
            },
          },
        ],
        binaryPaths: [{ path: `/${mockArchiveFileName}`, filePath: localArchiveFilePath }],
      });

      const configFilePath = path.join(testDirs.paths.dotfilesDir, 'config.yaml');
      await createMockYamlConfig({
        config: {
          paths: testDirs.paths,
          updates: {
            checkOnRun: false,
          },
          downloader: {
            cache: {
              enabled: false,
            },
          },
          github: {
            host: mockServer.baseUrl,
            cache: {
              enabled: false,
            },
          },
          userConfigPath: configFilePath,
        },
        filePath: configFilePath,
        fileSystem: fs,
        logger,
        systemInfo: {
          platform: 'linux',
          arch: 'x64',
          homeDir: testDirs.paths.homeDir,
        },
        env: {},
      });

      createToolConfig({
        toolConfigsDir: testDirs.paths.toolConfigsDir,
        name: mockArchiveToolName,
        fixturePath: path.resolve(__dirname, 'fixtures', 'archive-tool.tool.ts'),
      });

      const result = executeCliCommand({
        command: ['install', mockArchiveToolName, '--config', 'config.yaml'],
        cwd: testDirs.paths.dotfilesDir,
        homeDir: testDirs.paths.homeDir,
      });

      expect(result.stderr).toEqual('');
      expect(result.exitCode).toEqual(0);
    });

    afterAll(async () => {
      await mockServer.close();
    });

    it('should clean up downloaded archive after extraction', async () => {
      // Archive should be cleaned up after extraction
      expect(await fs.exists(path.join(testDirs.paths.binariesDir, mockArchiveToolName, mockArchiveFileName))).toBe(
        false
      );
    });

    it('should move binary to the direct location', async () => {
      expect(await fs.exists(expectedBinaryPath)).toBe(true);
    });

    it('should make binary executable', async () => {
      expect((await fs.stat(expectedBinaryPath)).mode & 0o100).toBeGreaterThan(0);
    });

    it('should verify the downloaded file content', async () => {
      const binaryContent = await fs.readFile(expectedBinaryPath, 'utf8');
      expect(binaryContent).toEqual(mockBinaryContent);
    });
  });
});
