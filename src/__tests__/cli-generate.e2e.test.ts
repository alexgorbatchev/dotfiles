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

describe('E2E: bun run cli generate', () => {
  describe('generating shims, shell init, and symlinks', () => {
    let directories: TestDirectories;
    let fs: NodeFileSystem;

    // Paths for generated artifacts
    let fzfShimPath: string;
    let lazygitShimPath: string;
    let generatorCliShimPath: string;
    let zshInitFilePath: string;
    let lazygitSourceConfigPath: string;
    let cliExitCode: number | null;
    let cliStderr: string;

    beforeAll(async () => {
      fs = new NodeFileSystem();
      directories = createTestDirectories({
        testName: 'cli-generate-e2e',
      });

      // Define paths for generated artifacts
      fzfShimPath = path.join(directories.paths.targetDir, 'fzf');
      lazygitShimPath = path.join(directories.paths.targetDir, 'lazygit');
      generatorCliShimPath = path.join(directories.paths.targetDir, 'shim');
      zshInitFilePath = path.join(directories.paths.generatedDir, 'completions', 'init.zsh');
      lazygitSourceConfigPath = path.join(
        directories.paths.dotfilesDir,
        '02-configs',
        'lazygit',
        'config.yml'
      );

      // Create mock lazygit config file at the location expected by the tool config
      await createFile(fs, lazygitSourceConfigPath, '# Sample lazygit config for E2E test');

      await createMockYamlConfig({
        config: {
          paths: directories.paths,
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

      // Create tool configs
      createToolConfig({
        toolConfigsDir: directories.paths.toolConfigsDir,
        name: 'fzf',
        fixturePath: path.resolve(__dirname, 'fixtures', 'fzf.tool.ts'),
      });
      createToolConfig({
        toolConfigsDir: directories.paths.toolConfigsDir,
        name: 'lazygit',
        fixturePath: path.resolve(__dirname, 'fixtures', 'lazygit.tool.ts'),
      });

      // Execute CLI command
      const result = executeCliCommand({
        command: ['generate'],
        cwd: directories.paths.dotfilesDir,
        homeDir: directories.paths.homeDir,
      });

      cliExitCode = result.exitCode;
      cliStderr = result.stderr;
    });

    it('should execute the CLI successfully', () => {
      expect(cliStderr).toEqual('');
      expect(cliExitCode).toEqual(0);
    });

    it('creates manifest file', async () => {
      expect(await fs.exists(directories.paths.manifestPath)).toBe(true);
    });

    it('should generate the correct shim files for fzf and lazygit', async () => {
      expect(await fs.exists(fzfShimPath)).toBe(true);
      expect(await fs.exists(lazygitShimPath)).toBe(true);
      expect(await fs.exists(generatorCliShimPath)).toBe(true);

      for (const shimP of [fzfShimPath, lazygitShimPath, generatorCliShimPath]) {
        const stat = await fs.stat(shimP);
        expect(stat.mode & 0o100).toBeGreaterThan(0); // Check executable
      }

      const fzfContent = await fs.readFile(fzfShimPath);
      expect(fzfContent).toContain('TOOL_NAME="fzf"');
      expect(fzfContent).toContain(
        `TOOL_EXECUTABLE="${path.join(directories.paths.binariesDir, 'fzf', 'fzf')}"`
      );

      const lazygitContent = await fs.readFile(lazygitShimPath);
      expect(lazygitContent).toContain('TOOL_NAME="lazygit"');
      expect(lazygitContent).toContain(
        `TOOL_EXECUTABLE="${path.join(directories.paths.binariesDir, 'lazygit', 'lazygit')}"`
      );
    });

    it('should generate the correct shell initialization file content', async () => {
      expect(await fs.exists(zshInitFilePath)).toBe(true);
      const content = await fs.readFile(zshInitFilePath);
      expect(content).toContain('# --- fzf ---');
      expect(content).toContain('export FZF_DEFAULT_OPTS=');
      expect(content).toContain('# --- lazygit ---');
      expect(content).toContain('alias g="lazygit"');
    });

    describe('manifest file', () => {
      let parsedManifest: any;
      beforeAll(async () => {
        parsedManifest = JSON.parse(await fs.readFile(directories.paths.manifestPath));
        expect(parsedManifest).not.toBeNull();
      });

      it('should verify symlinks in the manifest', async () => {
        expect(parsedManifest.symlinks.length).toBeGreaterThan(0);
        expect(parsedManifest.symlinks[0].sourcePath).toBe(lazygitSourceConfigPath);
      });

      it('should generate a manifest file with correct entries', async () => {
        expect(parsedManifest.shims).toContain(fzfShimPath);
        expect(parsedManifest.shims).toContain(lazygitShimPath);
        expect(parsedManifest.symlinks[0].sourcePath).toBe(lazygitSourceConfigPath);
        expect(parsedManifest.symlinks[0].targetPath).toContain('lazygit/config.yml');
      });

      it('should verify the symlink', async () => {
        const stat = await fs.lstat(parsedManifest.symlinks[0].targetPath);
        expect(stat.isSymbolicLink()).toBeTrue();

        const symlinkTarget = await fs.readlink(parsedManifest.symlinks[0].targetPath);
        expect(path.resolve(path.dirname(parsedManifest.symlinks[0].targetPath), symlinkTarget)).toBe(lazygitSourceConfigPath);
      });
    });
  });

  describe('executing a generated shim for an uninstalled tool', () => {
    let directories: TestDirectories;
    let fs: NodeFileSystem;
    let mockServer: MockGitHubServerResult;
    let fzfShimPath: string;
    let localArchiveFilePath: string;
    let manifestPath: string;
    let shimResult: { stdout: string; stderr: string; exitCode: number | null };

    const mockToolName = 'fzf';
    const mockToolVersion = '0.54.0'; // from fzf.tool.ts fixture
    const mockAssetFileName = `fzf-${mockToolVersion}-linux_amd64.tar.gz`;

    beforeAll(async () => {
      fs = new NodeFileSystem();
      directories = createTestDirectories({
        testName: 'cli-generate-shim-execution',
        additionalDirs: {
          'temp-archive-source': { path: 'temp-archive-source' },
        },
      });

      fzfShimPath = path.join(directories.paths.targetDir, mockToolName);
      manifestPath = path.join(directories.paths.generatedDir, 'manifest.json');

      // 1. Create a mock binary and archive it
      await createFile(
        fs,
        path.join(directories.getDir('temp-archive-source'), mockToolName),
        `#!/bin/sh\necho "Mock fzf v${mockToolVersion}"`,
        true
      );

      localArchiveFilePath = path.join(directories.paths.homeDir, mockAssetFileName);
      await $`tar -czf ${localArchiveFilePath} -C ${directories.getDir('temp-archive-source')} ${mockToolName}`.quiet();

      // 2. Setup mock github server
      mockServer = await createMockGitHubServer({
        apiPaths: [
          {
            path: `/repos/junegunn/fzf/releases/tags/${mockToolVersion}`,
            response: {
              tag_name: mockToolVersion,
              assets: [{ name: mockAssetFileName, browser_download_url: `/${mockAssetFileName}` }],
            },
          },
          {
            path: `/repos/junegunn/fzf/releases/latest`,
            response: {
              tag_name: mockToolVersion,
              assets: [{ name: mockAssetFileName, browser_download_url: `/${mockAssetFileName}` }],
            },
          },
        ],
        binaryPaths: [{ path: `/${mockAssetFileName}`, filePath: localArchiveFilePath }],
      });

      // 3. Create mock YAML config
      await createMockYamlConfig({
        config: {
          paths: {
            ...directories.paths,
            manifestPath: manifestPath,
          },
          github: {
            host: mockServer.baseUrl,
          },
        },
        filePath: path.join(directories.paths.dotfilesDir, 'config.yaml'),
        fileSystem: fs,
        systemInfo: { platform: 'linux', arch: 'x64', homeDir: directories.paths.homeDir },
        env: {},
      });

      // 4. Create tool config
      createToolConfig({
        toolConfigsDir: directories.paths.toolConfigsDir,
        name: mockToolName,
        fixturePath: path.resolve(__dirname, 'fixtures', 'fzf.tool.ts'),
      });

      // 5. Generate shims and symlinks
      const generateResult = executeCliCommand({
        command: ['generate'],
        cwd: directories.paths.dotfilesDir,
        homeDir: directories.paths.homeDir,
      });

      expect(generateResult.stderr).toEqual('');
      expect(generateResult.exitCode).toEqual(0);

      // 6. Execute the shim
      shimResult = executeCliCommand({
        command: ['--version'],
        cwd: directories.paths.homeDir,
        homeDir: directories.paths.homeDir,
        customCmd: [fzfShimPath],
        env: {},
      });
    });

    afterAll(async () => {
      await mockServer.close();
    });

    it('should attempt to execute the shim', () => {
      // The test environment doesn't have the actual CLI executable, so we expect an error
      expect(shimResult.stderr).toContain('No such file or directory');
    });

    it('should report failure when the tool is not found', () => {
      expect(shimResult.stdout).toContain('Failed to install');
      expect(shimResult.exitCode).not.toBe(0);
    });
  });
});
