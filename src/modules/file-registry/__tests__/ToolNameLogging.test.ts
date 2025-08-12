import { beforeEach, test } from 'bun:test';
import { MemFileSystem } from '@modules/file-system';
import { TestLogger } from '@testing-helpers';
import { SqliteFileRegistry, TrackedFileSystem } from '../index';

let logger: TestLogger;
let fs: MemFileSystem;
let registry: SqliteFileRegistry;
let trackedFs: TrackedFileSystem;

beforeEach(() => {
  logger = new TestLogger();
  fs = new MemFileSystem({});
  registry = new SqliteFileRegistry(logger, ':memory:');
  trackedFs = new TrackedFileSystem(
    logger,
    fs,
    registry,
    TrackedFileSystem.createContext('nodejs', 'binary'),
    '/home/test'
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
    '/home/test'
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
