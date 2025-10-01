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
  type MockApiServerResult,
  type TestDirectories,
  TestLogger,
} from '@testing-helpers';
import { $ } from 'zx';

describe('E2E: cli install (Cargo)', () => {
  describe('cargo-quickinstall binary', () => {
    let localMockArchiveFilePath: string;
    let expectedInstalledBinaryPath: string;
    let testDirs: TestDirectories;
    let fs: NodeFileSystem;
    let mockServer: MockApiServerResult;

    const mockToolName = 'mock-cargo-tool';
    const mockToolVersion = '1.0.0';
    const mockArchiveFileName = `${mockToolName}-${mockToolVersion}-aarch64-apple-darwin.tar.gz`;
    const mockBinaryContent = `#!/bin/sh\necho "Mock Cargo Tool v${mockToolVersion}"`;
    const mockCargoTomlContent = `[package]\nname = "${mockToolName}"\nversion = "${mockToolVersion}"\n`;

    beforeAll(async () => {
      fs = new NodeFileSystem();
      const logger = new TestLogger();
      testDirs = await createTestDirectories(logger, fs, {
        testName: 'cli-install-cargo-mock',
        additionalDirs: {
          'temp-archive-source': { path: 'temp-archive-source' },
        },
      });
      expectedInstalledBinaryPath = path.join(testDirs.paths.binariesDir, mockToolName, mockToolName);

      // Create archive with realistic directory structure for cargo-quickinstall
      // cargo-quickinstall archives typically have the binary directly in the root
      const archiveSourceDir = testDirs.getDir('temp-archive-source');
      await createFile(fs, path.join(archiveSourceDir, mockToolName), mockBinaryContent, true);

      localMockArchiveFilePath = path.join(testDirs.paths.homeDir, mockArchiveFileName);
      await $`tar -czf ${localMockArchiveFilePath} -C ${archiveSourceDir} ${mockToolName}`.quiet();

      // Create Cargo.toml file
      const cargoTomlPath = path.join(testDirs.paths.homeDir, 'Cargo.toml');
      await createFile(fs, cargoTomlPath, mockCargoTomlContent);

      mockServer = await createMockApiServer({
        binaryPaths: [
          // The cargo-quickinstall binary download endpoint (updated to match new URL pattern without /repos/)
          {
            path: `/cargo-bins/cargo-quickinstall/releases/download/${mockToolName}-${mockToolVersion}/${mockArchiveFileName}`,
            filePath: localMockArchiveFilePath,
          },
          // Cargo.toml endpoint
          { path: `/mock-owner/mock-cargo-tool/main/Cargo.toml`, filePath: cargoTomlPath },
        ],
      });

      const configFilePath = path.join(testDirs.paths.dotfilesDir, 'config.yaml');
      await createMockYamlConfig({
        config: {
          paths: testDirs.paths,
          github: {
            host: mockServer.baseUrl,
          },
          cargo: {
            cratesIo: { host: mockServer.baseUrl },
            githubRaw: { host: mockServer.baseUrl },
            githubRelease: { host: mockServer.baseUrl },
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
        fixturePath: path.resolve(__dirname, 'fixtures', 'mock-cargo-tool.tool.ts'),
      });
    });

    afterAll(async () => {
      await mockServer.close();
    });

    it('should download and extract the cargo-quickinstall archive to the correct location', async () => {
      const result = executeCliCommand({
        command: ['install', mockToolName, '--config', 'config.yaml'],
        cwd: testDirs.paths.dotfilesDir,
        homeDir: testDirs.paths.homeDir,
      });

      expect(result.exitCode).toEqual(0);
      expect(result.stderr).toEqual('');
      expect(await fs.exists(expectedInstalledBinaryPath)).toBe(true);
    });

    it('should make the extracted binary executable', async () => {
      expect((await fs.stat(expectedInstalledBinaryPath)).mode & 0o100).toBeGreaterThan(0);
    });

    it('should verify the extracted file content', async () => {
      const binaryContent = await fs.readFile(expectedInstalledBinaryPath, 'utf8');
      expect(binaryContent).toEqual(mockBinaryContent);
    });

    it('should clean up downloaded archive after extraction', async () => {
      // Archive should be cleaned up after extraction
      expect(await fs.exists(path.join(testDirs.paths.binariesDir, mockToolName, mockArchiveFileName))).toBe(false);
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

        // Modify the source archive to simulate a change on the server
        const modifiedBinaryContent = `#!/bin/sh\necho "Modified Mock Cargo Tool v${mockToolVersion}"`;
        const modifiedArchiveSourceDir = testDirs.getDir('temp-archive-source');
        await createFile(
          fs,
          path.join(modifiedArchiveSourceDir, `${mockToolName}-modified`),
          modifiedBinaryContent,
          true
        );

        const modifiedArchivePath = path.join(testDirs.paths.homeDir, `modified-${mockArchiveFileName}`);
        await $`tar -czf ${modifiedArchivePath} -C ${modifiedArchiveSourceDir} ${mockToolName}-modified`.quiet();

        // Update the mock server to serve the modified archive
        await fs.writeFile(localMockArchiveFilePath, await fs.readFile(modifiedArchivePath));

        // Wait a small amount to ensure any file operations would show different timestamps
        await new Promise((resolve) => setTimeout(resolve, 100));

        const result = executeCliCommand({
          command: ['install', mockToolName, '--config', 'config.yaml'],
          cwd: testDirs.paths.dotfilesDir,
          homeDir: testDirs.paths.homeDir,
        });

        expect(result.stderr).toEqual('');
        expect(result.exitCode).toEqual(0);

        // Verify the installed binary still has the original content (not the modified source)
        const finalContent = await fs.readFile(actualBinaryPath, 'utf8');
        expect(finalContent).toEqual(originalContent);
        expect(finalContent).toEqual(mockBinaryContent);
        expect(finalContent).not.toEqual(modifiedBinaryContent);

        // Verify binary is still accessible via the symlink
        expect(await fs.exists(binaryPath)).toBe(true);
      });
    });
  });
});
