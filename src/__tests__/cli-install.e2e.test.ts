import {
  createFile,
  createMockGitHubServer,
  createMockYamlConfig,
  createTestDirectories,
  createToolConfig,
  executeCliCommand,
  type MockGitHubServerResult,
  type TestDirectories,
} from '@testing-helpers';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import * as path from 'node:path';
import { $ } from 'zx';
import { NodeFileSystem } from '@modules/file-system';

describe('E2E: bun run cli install', () => {
  describe('downloaded direct binary (GitHub Release with Mock Server)', () => {
    let symlinkPath: string;
    let localMockBinaryFilePath: string;
    let expectedInstalledBinaryPath: string;
    let directories: TestDirectories;
    let fs: NodeFileSystem;
    let mockServer: MockGitHubServerResult;

    const mockToolName = 'mock-direct-binary-tool';
    const mockToolVersion = '1.0.0';
    const mockAssetFileName = `${mockToolName}-v${mockToolVersion}-linux-amd64`;
    const mockBinaryContent = `#!/bin/sh\necho "Mock Direct Binary Tool v${mockToolVersion}"`;

    beforeAll(async () => {
      fs = new NodeFileSystem();
      directories = createTestDirectories({ testName: 'cli-install-direct-binary-mock' });
      symlinkPath = path.join(directories.paths.targetDir, mockToolName);
      expectedInstalledBinaryPath = path.join(
        directories.paths.binariesDir,
        mockToolName,
        mockAssetFileName
      );

      localMockBinaryFilePath = await createFile(
        fs,
        path.join(directories.paths.homeDir, mockAssetFileName),
        mockBinaryContent,
        true
      );

      mockServer = await createMockGitHubServer({
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

      await createMockYamlConfig({
        config: {
          paths: directories.paths,
          github: {
            host: mockServer.baseUrl,
          },
        },
        filePath: path.join(directories.paths.dotfilesDir, 'config.yaml'),
        fileSystem: fs,
        systemInfo: {
          platform: 'linux',
          arch: 'x64',
          homeDir: directories.paths.homeDir,
        },
        env: {},
      });

      createToolConfig({
        toolConfigsDir: directories.paths.toolConfigsDir,
        name: mockToolName,
        fixturePath: path.resolve(__dirname, 'fixtures', 'mock-direct-binary-tool.tool.ts'),
      });

      const result = executeCliCommand({
        command: ['install', mockToolName],
        cwd: directories.paths.dotfilesDir,
        homeDir: directories.paths.homeDir,
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

    it('should create a symlink to the downloaded binary', async () => {
      expect(await fs.exists(symlinkPath)).toBe(true);
    });

    it('should verify the downloaded binary works via symlink', () => {
      const proc = Bun.spawnSync([symlinkPath], {
        stdout: 'pipe',
        env: { HOME: directories.paths.homeDir },
      });
      expect(proc.exitCode).toBe(0);
    });
  });

  describe('downloaded tar.gz archive (GitHub Release with Mock Server)', () => {
    let symlinkPath: string;
    let localArchiveFilePath: string;
    let expectedExtractedBinaryPath: string;
    let directories: TestDirectories;
    let fs: NodeFileSystem;
    let mockServer: MockGitHubServerResult;

    const mockArchiveToolName = 'archive-tool';
    const mockArchiveToolVersion = '1.0.0';
    const mockArchiveFileName = `${mockArchiveToolName}-v${mockArchiveToolVersion}-linux-amd64.tar.gz`;

    beforeAll(async () => {
      fs = new NodeFileSystem();
      directories = createTestDirectories({
        testName: 'cli-install-archive-mock',
        additionalDirs: {
          'temp-archive-source': { path: 'temp-archive-source' },
        },
      });
      symlinkPath = path.join(directories.paths.targetDir, mockArchiveToolName);
      expectedExtractedBinaryPath = path.join(
        directories.paths.binariesDir,
        mockArchiveToolName,
        mockArchiveToolName
      );

      await createFile(
        fs,
        path.join(directories.getDir('temp-archive-source'), mockArchiveToolName),
        `#!/bin/sh\necho "Archive Tool v${mockArchiveToolVersion}"`
      );

      localArchiveFilePath = path.join(directories.paths.homeDir, mockArchiveFileName);
      await $`tar -czf ${localArchiveFilePath} -C ${directories.getDir('temp-archive-source')} ${mockArchiveToolName}`.quiet();

      mockServer = await createMockGitHubServer({
        apiPaths: [
          {
            path: `/repos/mock-owner/archive-repo/releases/tags/v${mockArchiveToolVersion}`,
            response: {
              tag_name: `v${mockArchiveToolVersion}`,
              assets: [
                { name: mockArchiveFileName, browser_download_url: `/${mockArchiveFileName}` },
              ],
            },
          },
          {
            path: `/repos/mock-owner/archive-repo/releases/latest`,
            response: {
              tag_name: `v${mockArchiveToolVersion}`,
              assets: [
                { name: mockArchiveFileName, browser_download_url: `/${mockArchiveFileName}` },
              ],
            },
          },
        ],
        binaryPaths: [{ path: `/${mockArchiveFileName}`, filePath: localArchiveFilePath }],
      });

      await createMockYamlConfig({
        config: {
          paths: directories.paths,
          github: {
            host: mockServer.baseUrl,
          },
        },
        filePath: path.join(directories.paths.dotfilesDir, 'config.yaml'),
        fileSystem: fs,
        systemInfo: {
          platform: 'linux',
          arch: 'x64',
          homeDir: directories.paths.homeDir,
        },
        env: {},
      });

      // Create tool config from fixture
      createToolConfig({
        toolConfigsDir: directories.paths.toolConfigsDir,
        name: mockArchiveToolName,
        fixturePath: path.resolve(__dirname, 'fixtures', 'archive-tool.tool.ts'),
      });

      // Execute CLI command
      const result = executeCliCommand({
        command: ['install', mockArchiveToolName],
        env: {
          GITHUB_HOST: mockServer.baseUrl,
          CACHE_ENABLED: 'false',
          GITHUB_API_CACHE_ENABLED: 'false',
          CHECK_UPDATES_ON_RUN: 'false',
        },
        cwd: directories.paths.dotfilesDir,
        homeDir: directories.paths.homeDir,
      });

      expect(result.stderr).toEqual('');
      expect(result.exitCode).toEqual(0);
    });

    afterAll(async () => {
      await mockServer.close();
    });

    it('should download archive to the correct location', async () => {
      expect(
        await fs.exists(
          path.join(directories.paths.binariesDir, mockArchiveToolName, mockArchiveFileName)
        )
      ).toBe(true);
    });

    it('should extract binary to the correct location', async () => {
      expect(await fs.exists(expectedExtractedBinaryPath)).toBe(true);
    });

    it('should make extracted binary executable', async () => {
      expect((await fs.stat(expectedExtractedBinaryPath)).mode & 0o100).toBeGreaterThan(0);
    });

    it('should create symlink to extracted binary', async () => {
      expect(await fs.exists(symlinkPath)).toBe(true);
    });

    it('should verify extracted binary works via symlink', () => {
      const proc = Bun.spawnSync([symlinkPath], {
        stdout: 'pipe',
        env: { HOME: directories.paths.homeDir },
      });
      expect(proc.exitCode).toBe(0);
    });
  });
});
