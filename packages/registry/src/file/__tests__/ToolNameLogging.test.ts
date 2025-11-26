import { beforeEach, test } from 'bun:test';
import type { ProjectConfig } from '@dotfiles/core';
import { MemFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { RegistryDatabase } from '@dotfiles/registry-database';
import { FileRegistry } from '../FileRegistry';
import { TrackedFileSystem } from '../TrackedFileSystem';

let logger: TestLogger;
let fs: MemFileSystem;
let registry: FileRegistry;
let registryDatabase: RegistryDatabase;
let trackedFs: TrackedFileSystem;
let mockProjectConfig: ProjectConfig;

beforeEach(() => {
  logger = new TestLogger();
  fs = new MemFileSystem({});
  registryDatabase = new RegistryDatabase(logger, ':memory:');
  registry = new FileRegistry(logger, registryDatabase.getConnection());
  mockProjectConfig = {
    paths: {
      homeDir: '/home/test',
      dotfilesDir: '/home/test/.dotfiles',
      targetDir: '/home/test',
      generatedDir: '/home/test/.generated',
      toolConfigsDir: '/home/test/.dotfiles/tools',
      shellScriptsDir: '/home/test/.generated/shell-scripts',
      binariesDir: '/home/test/.generated/binaries',
    },
  } as ProjectConfig;
  trackedFs = new TrackedFileSystem(
    logger,
    fs,
    registry,
    TrackedFileSystem.createContext('nodejs', 'binary'),
    mockProjectConfig
  );
});

test('should include tool name in filesystem operation logs', async () => {
  // Test directory creation first (which creates the parent directory)
  await trackedFs.mkdir('/test');

  // Test file creation
  await trackedFs.writeFile('/test/file.txt', 'content');

  // Verify the logs include the tool name in sequence
  logger.expect(['INFO'], ['TrackedFileSystem'], ['[nodejs] mkdir /test', '[nodejs] write /test/file.txt']);
});

test('should show different tool names for different contexts', async () => {
  // Create a TrackedFileSystem for a different tool
  const curlTrackedFs = new TrackedFileSystem(
    logger,
    fs,
    registry,
    TrackedFileSystem.createContext('curl', 'binary'),
    mockProjectConfig
  );

  // Create parent directories
  await trackedFs.mkdir('/nodejs');
  await curlTrackedFs.mkdir('/curl');

  // Create files with different tools
  await trackedFs.writeFile('/nodejs/file.txt', 'content');
  await curlTrackedFs.writeFile('/curl/file.txt', 'content');

  // Should see both tool names in logs in sequence
  logger.expect(
    ['INFO'],
    ['TrackedFileSystem'],
    ['[nodejs] mkdir /nodejs', '[curl] mkdir /curl', '[nodejs] write /nodejs/file.txt', '[curl] write /curl/file.txt']
  );
});
