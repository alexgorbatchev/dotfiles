import {
  createMockYamlConfig,
  createTestDirectories,
  executeCliCommand,
  TestLogger,
  type TestDirectories,
} from '@testing-helpers';
import { beforeAll, describe, expect, it } from 'bun:test';
import * as path from 'node:path';
import { NodeFileSystem } from '@modules/file-system';

describe('E2E: CLI --platform and --arch flags', () => {
  describe('platform and arch override functionality', () => {
    let testDirs: TestDirectories;
    let fs: NodeFileSystem;

    beforeAll(async () => {
      fs = new NodeFileSystem();
      const logger = new TestLogger();
      testDirs = await createTestDirectories(logger, fs, { testName: 'cli-platform-arch-flags' });

      await createMockYamlConfig({
        config: {
          paths: testDirs.paths,
        },
        filePath: path.join(testDirs.paths.dotfilesDir, 'config.yaml'),
        logger,
        fileSystem: fs,
        systemInfo: { platform: 'darwin', arch: 'arm64', homeDir: testDirs.paths.homeDir },
        env: {},
      });
    });

    it('should use --platform flag to override detected platform', () => {
      const result = executeCliCommand({
        command: [
          'files',
          '--platform',
          'linux',
        ],
        cwd: testDirs.paths.dotfilesDir,
        homeDir: testDirs.paths.homeDir,
      });

      // The files command should run and show the platform override warning
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Platform overridden to: linux');
    });

    it('should use --arch flag to override detected architecture', () => {
      const result = executeCliCommand({
        command: [
          'files',
          '--arch',
          'x64',
        ],
        cwd: testDirs.paths.dotfilesDir,
        homeDir: testDirs.paths.homeDir,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Architecture overridden to: x64');
    });

    it('should use both --platform and --arch flags together', () => {
      const result = executeCliCommand({
        command: [
          'files',
          '--platform',
          'linux',
          '--arch',
          'x64',
        ],
        cwd: testDirs.paths.dotfilesDir,
        homeDir: testDirs.paths.homeDir,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Platform overridden to: linux');
      expect(result.stdout).toContain('Architecture overridden to: x64');
    });

    it('should not show override messages when flags are not used', () => {
      const result = executeCliCommand({
        command: ['--help'],
        cwd: testDirs.paths.dotfilesDir,
        homeDir: testDirs.paths.homeDir,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain('Platform overridden');
      expect(result.stdout).not.toContain('Architecture overridden');
    });
  });
});