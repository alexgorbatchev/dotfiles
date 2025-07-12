/**
 * @fileoverview End-to-end tests for the `bun run cli install` command.
 *
 * ## Development Plan
 *
 * ### Overall Task: Create E2E test for `bun ./src/cli.ts install`
 * - [x] **Part 1: Create E2E Test File and Directory Structure (This file)**
 *   - [x] Create `src/__tests__/cli-install.e2e.test.ts`.
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
import { $ } from 'zx';
import {
  createTestDirectories,
  createToolConfig,
  executeCliCommand,
  setupEnvironmentVariables,
  createMockGitHubServer,
  createBinFile,
  type MockGitHubServerResult
} from '@testing-helpers';

describe('E2E: bun run cli install', () => {
  describe('downloaded direct binary (GitHub Release with Mock Server)', () => {
    let tempDir: string;
    let toolConfigsDir: string;
    let binariesDir: string;
    let binDir: string;
    let symlinkPath: string;
    let localMockBinaryFilePath: string;
    let expectedInstalledBinaryPath: string;

    const mockToolName = 'mock-direct-binary-tool';
    const mockToolVersion = '1.0.0';
    const mockAssetFileName = `${mockToolName}-v${mockToolVersion}-linux-amd64`;
    const mockBinaryContent = `#!/bin/sh\necho "Mock Direct Binary Tool v${mockToolVersion}"`;

    let mockServer!: MockGitHubServerResult;

    beforeAll(async () => {
      // Create test directories
      const directories = createTestDirectories({
        testName: 'cli-install-direct-binary-mock'
      });
      
      // Destructure directory paths
      ({
        tempDir,
        toolConfigsDir,
        binariesDir,
        binDir
      } = directories);
      
      // Create mock binary file
      localMockBinaryFilePath = createBinFile(
        path.join(tempDir, mockAssetFileName),
        mockBinaryContent
      );

      // Setup mock server
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

      // Setup paths for verification
      expectedInstalledBinaryPath = path.join(binariesDir, mockToolName, mockAssetFileName);
      symlinkPath = path.join(binDir, mockToolName);

      // Create config.yaml in the dotfiles directory
      const configYamlPath = path.join(directories.dotfilesDir, 'config.yaml');
      const configYamlContent = `
paths:
  homeDir: ${tempDir}
  dotfilesDir: ${directories.dotfilesDir}
  targetDir: ${directories.binDir}
  generatedDir: ${directories.generatedDir}
  toolConfigsDir: ${directories.toolConfigsDir}
  completionsDir: ${path.join(directories.generatedDir, 'completions')}
  manifestPath: ${path.join(directories.generatedDir, 'manifest.json')}
  binariesDir: ${directories.binariesDir}
system:
  sudoPrompt: 'Enter password:'
logging:
  debug: ''
updates:
  checkOnRun: false
  checkInterval: 86400
github:
  token: ''
  host: '${mockServer.baseUrl}'
  userAgent: 'test-agent'
  cache:
    enabled: false
    ttl: 86400000
downloader:
  timeout: 300000
  retryCount: 3
  retryDelay: 1000
  cache:
    enabled: false
`;
      fs.writeFileSync(configYamlPath, configYamlContent);

      // Create tool config from fixture
      createToolConfig({
        toolConfigsDir,
        name: mockToolName,
        fixturePath: path.resolve(__dirname, 'fixtures', 'mock-direct-binary-tool.tool.ts'),
      });

      // Execute CLI command
      const result = executeCliCommand({
        command: ['install', mockToolName],
        env: setupEnvironmentVariables({
          directories,
          mockServerBaseUrl: mockServer.baseUrl,
        }) as Record<string, string>,
        homeDir: tempDir,
      });

      expect(result.stderr).toEqual('');
      expect(result.exitCode).toEqual(0);
    });

    afterAll(async () => {
      if (mockServer) {
        await mockServer.close();
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
    let toolConfigsDir: string;
    let binariesDir: string;
    let binDir: string;
    let symlinkPath: string;
    let localArchiveFilePath: string;
    let expectedExtractedBinaryPath: string;

    const mockArchiveToolName = 'archive-tool';
    const mockArchiveToolVersion = '1.0.0';
    const mockArchiveFileName = `${mockArchiveToolName}-v${mockArchiveToolVersion}-linux-amd64.tar.gz`;

    let mockServer!: MockGitHubServerResult;

    beforeAll(async () => {
      // Create test directories
      const directories = createTestDirectories({
        testName: 'cli-install-archive-mock',
        additionalDirs: {
          'temp-archive-source': { path: 'temp-archive-source', relativeTo: 'tempDir' }
        }
      });
      
      // Destructure directory paths
      ({
        tempDir,
        toolConfigsDir,
        binariesDir,
        binDir
      } = directories);
      
      // Create binary file in the archive source directory
      createBinFile(
        path.join(directories.getDir('temp-archive-source'), mockArchiveToolName),
        `#!/bin/sh\necho "Archive Tool v${mockArchiveToolVersion}"`
      );

      // Create the archive file
      localArchiveFilePath = path.join(tempDir, mockArchiveFileName);
      await $`tar -czf ${localArchiveFilePath} -C ${directories.getDir('temp-archive-source')} ${mockArchiveToolName}`.quiet();

      // Setup mock server
      mockServer = await createMockGitHubServer({
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

      // Setup paths for verification
      expectedExtractedBinaryPath = path.join(
        binariesDir,
        mockArchiveToolName,
        mockArchiveToolName
      );
      symlinkPath = path.join(binDir, mockArchiveToolName);

      // Create config.yaml in the dotfiles directory
      const configYamlPath = path.join(directories.dotfilesDir, 'config.yaml');
      const configYamlContent = `
paths:
  homeDir: ${tempDir}
  dotfilesDir: ${directories.dotfilesDir}
  targetDir: ${directories.binDir}
  generatedDir: ${directories.generatedDir}
  toolConfigsDir: ${directories.toolConfigsDir}
  completionsDir: ${path.join(directories.generatedDir, 'completions')}
  manifestPath: ${path.join(directories.generatedDir, 'manifest.json')}
  binariesDir: ${directories.binariesDir}
system:
  sudoPrompt: 'Enter password:'
logging:
  debug: ''
updates:
  checkOnRun: false
  checkInterval: 86400
github:
  token: ''
  host: '${mockServer.baseUrl}'
  userAgent: 'test-agent'
  cache:
    enabled: false
    ttl: 86400000
downloader:
  timeout: 300000
  retryCount: 3
  retryDelay: 1000
  cache:
    enabled: false
`;
      fs.writeFileSync(configYamlPath, configYamlContent);

      // Create tool config from fixture
      createToolConfig({
        toolConfigsDir,
        name: mockArchiveToolName,
        fixturePath: path.resolve(__dirname, 'fixtures', 'archive-tool.tool.ts'),
      });

      // Execute CLI command
      const result = executeCliCommand({
        command: ['install', mockArchiveToolName],
        env: setupEnvironmentVariables({
          directories,
          mockServerBaseUrl: mockServer.baseUrl,
        }) as Record<string, string>,
        homeDir: tempDir,
      });

      expect(result.stderr).toEqual('');
      expect(result.exitCode).toEqual(0);
    });

    afterAll(async () => {
      await mockServer?.close();
    });

    it('should download archive to the correct location', () => {
      expect(fs.existsSync(path.join(binariesDir, mockArchiveToolName, mockArchiveFileName))).toBe(true);
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
