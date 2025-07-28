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
      directories = await createTestDirectories(fs,{ testName: 'cli-install-direct-binary-mock' });
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
    let testDirs: TestDirectories;
    let fs: NodeFileSystem;
    let mockServer: MockGitHubServerResult;

    const mockArchiveToolName = 'archive-tool';
    const mockArchiveToolVersion = '1.0.0';
    const mockArchiveFileName = `${mockArchiveToolName}-v${mockArchiveToolVersion}-linux-amd64.tar.gz`;

    beforeAll(async () => {
      fs = new NodeFileSystem();
      testDirs = await createTestDirectories(fs,{
        testName: 'cli-install-archive-mock',
        additionalDirs: {
          'temp-archive-source': { path: 'temp-archive-source' },
        },
      });
      symlinkPath = path.join(testDirs.paths.targetDir, mockArchiveToolName);
      expectedExtractedBinaryPath = path.join(
        testDirs.paths.binariesDir,
        mockArchiveToolName,
        mockArchiveToolName
      );

      await createFile(
        fs,
        path.join(testDirs.getDir('temp-archive-source'), mockArchiveToolName),
        `#!/bin/sh\necho "Archive Tool v${mockArchiveToolVersion}"`
      );

      localArchiveFilePath = path.join(testDirs.paths.homeDir, mockArchiveFileName);
      await $`tar -czf ${localArchiveFilePath} -C ${testDirs.getDir('temp-archive-source')} ${mockArchiveToolName}`.quiet();

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
          paths: testDirs.paths,
          updates: {
            checkOnRun: false,
          },
          downloader: {
            cache: {
              enabled: false,
            }
          },
          github: {
            host: mockServer.baseUrl,
            cache: {
              enabled: false,
            },
          },
        },
        filePath: path.join(testDirs.paths.dotfilesDir, 'config.yaml'),
        fileSystem: fs,
        systemInfo: {
          platform: 'linux',
          arch: 'x64',
          homeDir: testDirs.paths.homeDir,
        },
        env: {},
      });

      // Create tool config from fixture
      createToolConfig({
        toolConfigsDir: testDirs.paths.toolConfigsDir,
        name: mockArchiveToolName,
        fixturePath: path.resolve(__dirname, 'fixtures', 'archive-tool.tool.ts'),
      });

      // Execute CLI command
      const result = executeCliCommand({
        command: ['install', mockArchiveToolName],
        cwd: testDirs.paths.dotfilesDir,
        homeDir: testDirs.paths.homeDir,
      });

      console.log(result.stdout);
      console.log(symlinkPath);
      expect(result.stderr).toEqual('');
      expect(result.exitCode).toEqual(0);
    });

    afterAll(async () => {
      await mockServer.close();
    });

    it('should download archive to the correct location', async () => {
      expect(
        await fs.exists(
          path.join(testDirs.paths.binariesDir, mockArchiveToolName, mockArchiveFileName)
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
        env: { HOME: testDirs.paths.homeDir },
      });
      expect(proc.exitCode).toBe(0);
    });
  });
});
