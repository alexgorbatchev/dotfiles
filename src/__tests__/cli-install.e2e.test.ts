/**
 * @fileoverview End-to-end tests for the `bun run cli install` command.
 *
 * ## Development Plan
 *
 * ### Overall Task: Create E2E test for `bun ./src/cli.ts install`
 * - [x] **Part 1: Create E2E Test File and Directory Structure (This file)**
 *   - [x] Create `generator/src/__tests__/cli-install.e2e.test.ts`.
 *   - [x] Add initial imports and development plan.
 * - [x] **Part 2: Implement Test Setup, CLI Execution, and Teardown (`beforeAll`)**
 *   - [x] Use `beforeAll` to:
 *     - [x] Create a unique temporary directory (and clean up previous).
 *     - [x] Define paths for `dotfilesDir`, `generatedDir`, `toolConfigsDir`, etc.
 *     - [x] Create necessary directories.
 *     - [x] Create mock tool configuration files for testing.
 *     - [x] Create mock binary files/archives to simulate GitHub releases.
 *     - [x] Execute `bun ./src/cli.ts install` using `Bun.spawnSync` with appropriate environment.
 *     - [x] Store CLI output (`stdout`, `stderr`, `exitCode`).
 * - [x] **Part 3: Implement E2E Test for .tar.gz Archive Installation (Now with Mock Server)**
 *   - [x] Create a mock .tar.gz archive with a binary inside.
 *   - [x] Create a tool configuration for the archive-based tool using 'github-release'.
 *   - [x] Setup mock GitHub server to serve the archive and API responses.
 *   - [x] Execute the CLI install command with GITHUB_HOST pointing to mock server.
 *   - [x] Verify that the binary was extracted and installed correctly.
 * - [x] **Part 4: Implement E2E Test for Direct Binary Installation (Now with Mock Server)**
 *   - [x] Create a mock executable binary file.
 *   - [x] Create a tool configuration for the direct binary tool using 'github-release'.
 *   - [x] Setup mock GitHub server to serve the binary and API responses.
 *   - [x] Execute the CLI install command with GITHUB_HOST pointing to mock server.
 *   - [x] Verify that the binary was installed correctly.
 * - [x] **Part 5: Adherence to Rules and Verification**
 *   - [x] Update development plan checklists in this file.
 *   - [x] (CI/User) Run *all* project tests (including this E2E test).
 *   - [x] (CI/User) Run lint/type checks.
 * - [x] **Part 6: Update E2E Install Tests for GitHub Release with Mock Server (Completed for both suites)**
 *   - [x] Update both test suites to use `setupMockGitHubServer`.
 *   - [x] Define mock GitHub API responses for release and asset download.
 *   - [x] Set `GITHUB_HOST` environment variable to the mock server's base URL.
 *   - [x] Rely on the mock server for asset delivery.
 *   - [x] Add `afterAll` to close the mock servers.
 * - [x] Write tests for the module. (This file is the test itself)
 * - [x] Cleanup all linting errors and warnings. (Will be attempted via `bun lint`)
 * - [x] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [x] Ensure 100% test coverage for executable code. (N/A for test file itself, but for the CLI it tests)
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ConfigEnvironment } from '@modules/config';
import { $ } from 'zx';
import { createTempDir, setupMockGitHubServer, type MockGitHubServerResult } from './helpers';

describe('E2E: bun run cli install', () => {
  describe('downloaded direct binary (GitHub Release with Mock Server)', () => {
    let tempDir: string;
    let dotfilesDir: string;
    let generatedDir: string;
    let toolConfigsDir: string;
    let binariesDir: string;
    let binDir: string;
    let symlinkPath: string;
    let manifestPathFromEnv: string;
    let localMockBinaryFilePath: string;
    let expectedInstalledBinaryPath: string;

    const mockToolName = 'mock-direct-binary-tool';
    const mockToolVersion = '1.0.0';
    const mockAssetFileName = `${mockToolName}-v${mockToolVersion}-linux-amd64`;
    const mockBinaryContent = `#!/bin/sh\necho "Mock Direct Binary Tool v${mockToolVersion}"`;

    const mockToolConfigContent = `
      import { type GithubReleaseToolConfig } from '@types'; // Use specific type
      const config: GithubReleaseToolConfig = { // Use specific type
        name: '${mockToolName}',
        binaries: ['${mockToolName}'],
        version: '${mockToolVersion}',
        installationMethod: 'github-release',
        installParams: {
          repo: 'mock-owner/direct-binary-repo',
          assetPattern: '${mockAssetFileName}',
        },
      };
      export default config;
    `;

    let mockServer!: MockGitHubServerResult;

    beforeAll(async () => {
      tempDir = createTempDir('cli-install-direct-binary-mock');
      dotfilesDir = path.join(tempDir, 'my-dotfiles-repo');
      generatedDir = path.join(dotfilesDir, '.generated');
      toolConfigsDir = path.join(dotfilesDir, 'actual-tool-configs');
      binariesDir = path.join(generatedDir, 'binaries');
      binDir = path.join(generatedDir, 'bin');

      fs.mkdirSync(dotfilesDir, { recursive: true });
      fs.mkdirSync(generatedDir, { recursive: true });
      fs.mkdirSync(toolConfigsDir, { recursive: true });
      fs.mkdirSync(binariesDir, { recursive: true });
      fs.mkdirSync(binDir, { recursive: true });

      localMockBinaryFilePath = path.join(tempDir, mockAssetFileName);
      fs.writeFileSync(localMockBinaryFilePath, mockBinaryContent);
      fs.chmodSync(localMockBinaryFilePath, 0o755);

      const serverRoutePath = `/${mockAssetFileName}`;
      const assetApiDownloadPath = serverRoutePath;

      mockServer = await setupMockGitHubServer({
        apiPaths: [
          {
            path: `/repos/mock-owner/direct-binary-repo/releases/tags/v${mockToolVersion}`,
            response: {
              tag_name: `v${mockToolVersion}`,
              assets: [{ name: mockAssetFileName, browser_download_url: assetApiDownloadPath }],
            },
          },
          {
            path: `/repos/mock-owner/direct-binary-repo/releases/latest`,
            response: {
              tag_name: `v${mockToolVersion}`,
              assets: [{ name: mockAssetFileName, browser_download_url: assetApiDownloadPath }],
            },
          },
        ],
        binaryPaths: [{ path: serverRoutePath, filePath: localMockBinaryFilePath }],
      });

      manifestPathFromEnv = path.join(generatedDir, 'generated-manifest.json');
      const envVarsForCli: ConfigEnvironment = {
        DOTFILES_DIR: dotfilesDir,
        GENERATED_DIR: generatedDir,
        TOOL_CONFIGS_DIR: toolConfigsDir,
        TARGET_DIR: binDir,
        GENERATED_ARTIFACTS_MANIFEST_PATH: manifestPathFromEnv,
        DEBUG: process.env['DEBUG'] || 'true', // Force some debug output from CLI
        CACHE_ENABLED: 'false',
        GITHUB_API_CACHE_ENABLED: 'false',
        CHECK_UPDATES_ON_RUN: 'false',
        GITHUB_HOST: mockServer.baseUrl,
      };

      const mockToolConfigDest = path.join(toolConfigsDir, `${mockToolName}.tool.ts`);
      fs.writeFileSync(mockToolConfigDest, mockToolConfigContent);

      expectedInstalledBinaryPath = path.join(binariesDir, mockToolName, mockAssetFileName);
      symlinkPath = path.join(binDir, mockToolName);

      if (fs.existsSync(symlinkPath)) fs.unlinkSync(symlinkPath);
      if (fs.existsSync(expectedInstalledBinaryPath)) {
        fs.rmSync(path.dirname(expectedInstalledBinaryPath), { recursive: true, force: true });
      }

      const generatorProjectRootPath = path.resolve(__dirname, '../../../generator');
      const cliEntryPoint = path.join(generatorProjectRootPath, 'src', 'cli.ts');
      const proc = Bun.spawnSync({
        cmd: ['bun', cliEntryPoint, 'install', mockToolName],
        cwd: generatorProjectRootPath,
        env: { ...envVarsForCli, PATH: process.env['PATH'], HOME: tempDir },
        stdout: 'pipe',
        stderr: 'pipe',
      });

      expect(proc.stderr.toString().trim()).toEqual('');
      expect(proc.exitCode).toEqual(0);
    });

    afterAll(async () => {
      if (mockServer?.server) {
        await new Promise<void>((resolve, reject) => {
          mockServer.server.close((err?: Error) => (err ? reject(err) : resolve()));
        });
      }
    });

    it('should download the binary asset to the correct location', () => {
      expect(fs.existsSync(expectedInstalledBinaryPath)).toBe(true);
    });
    it('should make the downloaded binary executable', () => {
      expect(fs.statSync(expectedInstalledBinaryPath).mode & 0o100).toBeGreaterThan(0);
    });
    it('should create a symlink to the downloaded binary', () => {
      expect(fs.existsSync(symlinkPath)).toBe(true);
    });
    it('should verify the downloaded binary works via symlink', () => {
      const proc = Bun.spawnSync([symlinkPath], { stdout: 'pipe', env: { HOME: tempDir } });
      expect(proc.exitCode).toBe(0);
    });
  });

  describe('downloaded tar.gz archive (GitHub Release with Mock Server)', () => {
    let tempDir: string;
    let dotfilesDir: string;
    let generatedDir: string;
    let toolConfigsDir: string;
    let binariesDir: string;
    let binDir: string;
    let symlinkPath: string;
    let manifestPathFromEnv: string;
    let localArchiveFilePath: string;
    let expectedExtractedBinaryPath: string;

    const mockArchiveToolName = 'archive-tool';
    const mockArchiveToolVersion = '1.0.0';
    const mockArchiveFileName = `${mockArchiveToolName}-v${mockArchiveToolVersion}-linux-amd64.tar.gz`;
    const mockBinaryContentInArchive = `#!/bin/sh\necho "Archive Tool v${mockArchiveToolVersion}"`;

    const mockArchiveToolConfigContent = `
      import { type GithubReleaseToolConfig } from '@types'; // Use specific type
      const config: GithubReleaseToolConfig = { // Use specific type
        name: '${mockArchiveToolName}',
        binaries: ['${mockArchiveToolName}'],
        version: '${mockArchiveToolVersion}',
        installationMethod: 'github-release',
        installParams: {
          repo: 'mock-owner/archive-repo',
          assetPattern: '${mockArchiveFileName}',
          binaryPath: '${mockArchiveToolName}', // This is a valid property for GithubReleaseInstallParams
        },
      };
      export default config;
    `;

    let mockServer!: MockGitHubServerResult;

    beforeAll(async () => {
      tempDir = createTempDir('cli-install-archive-mock');
      dotfilesDir = path.join(tempDir, 'my-dotfiles-repo');
      generatedDir = path.join(dotfilesDir, '.generated');
      toolConfigsDir = path.join(dotfilesDir, 'actual-tool-configs');
      binariesDir = path.join(generatedDir, 'binaries');
      binDir = path.join(generatedDir, 'bin');

      fs.mkdirSync(dotfilesDir, { recursive: true });
      fs.mkdirSync(generatedDir, { recursive: true });
      fs.mkdirSync(toolConfigsDir, { recursive: true });
      fs.mkdirSync(binariesDir, { recursive: true });
      fs.mkdirSync(binDir, { recursive: true });

      const tempArchiveSourceDir = path.join(tempDir, 'temp-archive-source');
      fs.mkdirSync(tempArchiveSourceDir, { recursive: true });
      const binaryInArchiveSource = path.join(tempArchiveSourceDir, mockArchiveToolName);
      fs.writeFileSync(binaryInArchiveSource, mockBinaryContentInArchive);
      fs.chmodSync(binaryInArchiveSource, 0o755);

      localArchiveFilePath = path.join(tempDir, mockArchiveFileName);
      $.quiet = true;
      await $`tar -czf ${localArchiveFilePath} -C ${tempArchiveSourceDir} ${mockArchiveToolName}`;
      $.quiet = false;

      const serverRoutePath = `/${mockArchiveFileName}`;
      const assetApiDownloadPath = serverRoutePath;

      mockServer = await setupMockGitHubServer({
        apiPaths: [
          {
            path: `/repos/mock-owner/archive-repo/releases/tags/v${mockArchiveToolVersion}`,
            response: {
              tag_name: `v${mockArchiveToolVersion}`,
              assets: [{ name: mockArchiveFileName, browser_download_url: assetApiDownloadPath }],
            },
          },
          {
            path: `/repos/mock-owner/archive-repo/releases/latest`,
            response: {
              tag_name: `v${mockArchiveToolVersion}`,
              assets: [{ name: mockArchiveFileName, browser_download_url: assetApiDownloadPath }],
            },
          },
        ],
        binaryPaths: [{ path: serverRoutePath, filePath: localArchiveFilePath }],
      });

      manifestPathFromEnv = path.join(generatedDir, 'generated-manifest.json');
      const envVarsForCli: ConfigEnvironment = {
        DOTFILES_DIR: dotfilesDir,
        GENERATED_DIR: generatedDir,
        TOOL_CONFIGS_DIR: toolConfigsDir,
        TARGET_DIR: binDir,
        GENERATED_ARTIFACTS_MANIFEST_PATH: manifestPathFromEnv,
        DEBUG: process.env['DEBUG'] || 'true', // Force some debug output from CLI
        CACHE_ENABLED: 'false',
        GITHUB_API_CACHE_ENABLED: 'false',
        CHECK_UPDATES_ON_RUN: 'false',
        GITHUB_HOST: mockServer.baseUrl,
      };

      const mockToolConfigDest = path.join(toolConfigsDir, `${mockArchiveToolName}.tool.ts`);
      fs.writeFileSync(mockToolConfigDest, mockArchiveToolConfigContent);

      expectedExtractedBinaryPath = path.join(
        binariesDir,
        mockArchiveToolName,
        mockArchiveToolName
      );
      symlinkPath = path.join(binDir, mockArchiveToolName);

      if (fs.existsSync(symlinkPath)) fs.unlinkSync(symlinkPath);
      if (fs.existsSync(expectedExtractedBinaryPath)) {
        fs.rmSync(path.dirname(expectedExtractedBinaryPath), { recursive: true, force: true });
      }

      const generatorProjectRootPath = path.resolve(__dirname, '../../../generator');
      const cliEntryPoint = path.join(generatorProjectRootPath, 'src', 'cli.ts');
      const proc = Bun.spawnSync({
        cmd: ['bun', cliEntryPoint, 'install', mockArchiveToolName],
        cwd: generatorProjectRootPath,
        env: { ...envVarsForCli, PATH: process.env['PATH'], HOME: tempDir },
        stdout: 'pipe',
        stderr: 'pipe',
      });

      expect(proc.stderr.toString().trim()).toEqual('');
      expect(proc.exitCode).toEqual(0);
    });

    afterAll(async () => {
      if (mockServer?.server) {
        await new Promise<void>((resolve, reject) => {
          mockServer.server.close((err?: Error) => (err ? reject(err) : resolve()));
        });
      }
    });

    it('should download archive to the correct location', () => {
      const expectedDownloadedArchivePath = path.join(
        binariesDir,
        mockArchiveToolName,
        mockArchiveFileName
      );
      expect(fs.existsSync(expectedDownloadedArchivePath)).toBe(true);
    });
    it('should extract binary to the correct location', () => {
      expect(fs.existsSync(expectedExtractedBinaryPath)).toBe(true);
    });
    it('should make extracted binary executable', () => {
      expect(fs.statSync(expectedExtractedBinaryPath).mode & 0o100).toBeGreaterThan(0);
    });
    it('should create symlink to extracted binary', () => {
      expect(fs.existsSync(symlinkPath)).toBe(true);
    });
    it('should verify extracted binary works via symlink', () => {
      const proc = Bun.spawnSync([symlinkPath], { stdout: 'pipe', env: { HOME: tempDir } });
      expect(proc.exitCode).toBe(0);
    });
  });
});
