import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { createMemFileSystem, type IFileSystem } from '@dotfiles/file-system';
import { TestLogger } from '@dotfiles/logger';
import { RegistryDatabase } from '@dotfiles/registry-database';
import { FileRegistry } from '../FileRegistry';
import { type ITrackingContext, TrackedFileSystem } from '../TrackedFileSystem';

describe('TrackedFileSystem', () => {
  let logger: TestLogger;
  let fs: IFileSystem;
  let registry: FileRegistry;
  let registryDatabase: RegistryDatabase;
  let trackedFs: TrackedFileSystem;
  let context: ITrackingContext;
  let dbPath: string;

  beforeEach(async () => {
    logger = new TestLogger();
    const { fs: memFs } = await createMemFileSystem();
    fs = memFs;

    dbPath = path.join('/tmp', `test-tracked-fs-${randomUUID()}.db`);
    registryDatabase = new RegistryDatabase(logger, dbPath);
    registry = new FileRegistry(logger, registryDatabase.getConnection());

    context = TrackedFileSystem.createContext('test-tool', 'shim');
    trackedFs = new TrackedFileSystem(logger, fs, registry, context, '/home/test');
  });

  afterEach(async () => {
    await registry.close();
    registryDatabase.close();
    try {
      await unlink(dbPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('createContext', () => {
    it('should create tracking context with unique operation ID', () => {
      const context1 = TrackedFileSystem.createContext('nodejs', 'shim');
      const context2 = TrackedFileSystem.createContext('nodejs', 'shim');

      expect(context1.toolName).toBe('nodejs');
      expect(context1.fileType).toBe('shim');
      expect(context1.operationId).toBeDefined();
      expect(context1.operationId).not.toBe(context2.operationId);
    });

    it('should include metadata in context', () => {
      const metadata = { version: '1.0.0' };
      const context = TrackedFileSystem.createContext('nodejs', 'binary', metadata);

      expect(context.metadata).toEqual(metadata);
    });
  });

  describe('withContext', () => {
    it('should create new TrackedFileSystem with updated context', () => {
      const newTrackedFs = trackedFs.withContext({ fileType: 'binary' });

      expect(newTrackedFs).toBeInstanceOf(TrackedFileSystem);
      expect(newTrackedFs).not.toBe(trackedFs);
    });
  });

  describe('writeFile', () => {
    it('should track file creation', async () => {
      const filePath = '/test/file.txt';
      const content = 'test content';

      // Ensure directory exists first
      await fs.mkdir('/test', { recursive: true });
      await trackedFs.writeFile(filePath, content);

      // Verify file was written
      const exists = await fs.exists(filePath);
      expect(exists).toBe(true);

      const fileContent = await fs.readFile(filePath);
      expect(fileContent).toBe(content);

      // Verify operation was tracked
      const operations = await registry.getOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0]).toMatchObject({
        toolName: 'test-tool',
        operationType: 'writeFile',
        filePath: path.resolve(filePath),
        fileType: 'shim',
      });
    });

    it('should track file update', async () => {
      const filePath = '/test/file.txt';

      // Ensure directory exists first
      await fs.mkdir('/test', { recursive: true });
      // Create file first
      await fs.writeFile(filePath, 'original content');

      // Update through tracked filesystem
      await trackedFs.writeFile(filePath, 'updated content');

      // Verify operation was tracked as update
      const operations = await registry.getOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0]?.operationType).toBe('writeFile');
    });

    it('should track file stats', async () => {
      const filePath = '/test/file.txt';
      const content = 'test content';

      // Ensure directory exists first
      await fs.mkdir('/test', { recursive: true });
      await trackedFs.writeFile(filePath, content);

      const operations = await registry.getOperations();
      expect(operations[0]?.sizeBytes).toBe(content.length);
      expect(operations[0]?.permissions).toBeDefined();
    });

    it('should skip write when content is identical', async () => {
      const filePath = '/test/file.txt';
      const content = 'identical content';

      // Ensure directory exists first
      await fs.mkdir('/test', { recursive: true });

      // Create file first
      await fs.writeFile(filePath, content);

      // Clear any tracked operations
      await registry.close();
      registryDatabase.close();
      registryDatabase = new RegistryDatabase(logger, dbPath);
      registry = new FileRegistry(logger, registryDatabase.getConnection());
      trackedFs = new TrackedFileSystem(logger, fs, registry, context, '/home/test');

      // Try to write identical content
      await trackedFs.writeFile(filePath, content);

      // Should not track operation since content is identical
      const operations = await registry.getOperations();
      expect(operations).toHaveLength(0);

      // File should still exist with same content
      const fileContent = await fs.readFile(filePath);
      expect(fileContent).toBe(content);
    });

    it('should write and track when content is different', async () => {
      const filePath = '/test/file.txt';
      const originalContent = 'original content';
      const newContent = 'new content';

      // Ensure directory exists first
      await fs.mkdir('/test', { recursive: true });

      // Create file first
      await fs.writeFile(filePath, originalContent);

      // Write different content through tracked filesystem
      await trackedFs.writeFile(filePath, newContent);

      // Should track operation since content is different
      const operations = await registry.getOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0]?.operationType).toBe('writeFile');

      // File should have new content
      const fileContent = await fs.readFile(filePath);
      expect(fileContent).toBe(newContent);
    });

    it('should write when file cannot be read', async () => {
      const filePath = '/test/file.txt';
      const content = 'test content';

      // Ensure directory exists first
      await fs.mkdir('/test', { recursive: true });

      // Create file but make readFile fail by mocking
      await fs.writeFile(filePath, 'original');
      const originalReadFile = fs.readFile;
      fs.readFile = async () => {
        throw new Error('Read failed');
      };

      // Write content through tracked filesystem
      await trackedFs.writeFile(filePath, content);

      // Should track operation since read failed
      const operations = await registry.getOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0]?.operationType).toBe('writeFile');

      // Restore original readFile
      fs.readFile = originalReadFile;
    });

    it('should handle ArrayBufferView content properly', async () => {
      const filePath = '/test/file.txt';
      const originalContent = 'original content';
      const newBuffer = Buffer.from('buffer content');

      // Ensure directory exists first
      await fs.mkdir('/test', { recursive: true });

      // Create file first
      await fs.writeFile(filePath, originalContent);

      // Write buffer content through tracked filesystem
      await trackedFs.writeFile(filePath, newBuffer);

      // Should track operation since content is different
      const operations = await registry.getOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0]?.operationType).toBe('writeFile');

      // File should have buffer content
      const fileContent = await fs.readFile(filePath);
      expect(fileContent).toBe('buffer content');
    });

    it('should skip write when ArrayBufferView content is identical', async () => {
      const filePath = '/test/file.txt';
      const content = 'buffer content';
      const buffer = Buffer.from(content);

      // Ensure directory exists first
      await fs.mkdir('/test', { recursive: true });

      // Create file first
      await fs.writeFile(filePath, content);

      // Clear any tracked operations
      await registry.close();
      registryDatabase.close();
      registryDatabase = new RegistryDatabase(logger, dbPath);
      registry = new FileRegistry(logger, registryDatabase.getConnection());
      trackedFs = new TrackedFileSystem(logger, fs, registry, context, '/home/test');

      // Try to write identical buffer content
      await trackedFs.writeFile(filePath, buffer);

      // Should not track operation since content is identical
      const operations = await registry.getOperations();
      expect(operations).toHaveLength(0);
    });
  });

  describe('copyFile', () => {
    it('should track file copying', async () => {
      const srcPath = '/test/source.txt';
      const destPath = '/test/dest.txt';
      const content = 'test content';

      // Ensure directory exists first
      await fs.mkdir('/test', { recursive: true });
      // Create source file
      await fs.writeFile(srcPath, content);

      // Copy through tracked filesystem
      await trackedFs.copyFile(srcPath, destPath);

      // Verify copy operation was tracked
      const operations = await registry.getOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0]).toMatchObject({
        operationType: 'cp',
        filePath: path.resolve(destPath),
      });
      expect(operations[0]?.targetPath).toBe(path.resolve(srcPath));
    });
  });

  describe('rename', () => {
    it('should track file renaming as single rename operation', async () => {
      const oldPath = '/test/old.txt';
      const newPath = '/test/new.txt';
      const content = 'test content';

      // Ensure directory exists first
      await fs.mkdir('/test', { recursive: true });
      // Create file
      await fs.writeFile(oldPath, content);

      // Rename through tracked filesystem
      await trackedFs.rename(oldPath, newPath);

      // Verify rename operation was tracked
      const operations = await registry.getOperations();
      expect(operations).toHaveLength(1);

      // Should have rename operation with target path
      const renameOp = operations[0];
      expect(renameOp).toBeDefined();
      if (renameOp) {
        expect(renameOp.operationType).toBe('rename');
        expect(renameOp.filePath).toBe(path.resolve(newPath));
        expect(renameOp.targetPath).toBe(path.resolve(oldPath));
      }
    });
  });

  describe('symlink', () => {
    it('should track symlink creation', async () => {
      const targetPath = '/test/target.txt';
      const linkPath = '/test/link.txt';

      // Ensure directory exists first
      await fs.mkdir('/test', { recursive: true });
      // Create target file first
      await fs.writeFile(targetPath, 'target content');

      // Create symlink through tracked filesystem
      await trackedFs.symlink(targetPath, linkPath);

      // Verify symlink operation was tracked
      const operations = await registry.getOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0]).toMatchObject({
        operationType: 'symlink',
        filePath: path.resolve(linkPath),
        targetPath: path.resolve(targetPath),
        fileType: 'shim', // Uses context.fileType (in this test, 'shim')
      });
    });

    it('should track symlink with fileType=completion when using withFileType', async () => {
      const targetPath = '/test/completion-source.zsh';
      const linkPath = '/test/completions/_tool';

      await fs.mkdir('/test', { recursive: true });
      await fs.mkdir('/test/completions', { recursive: true });
      await fs.writeFile(targetPath, '# completion');

      const completionFs = trackedFs.withFileType('completion');
      await completionFs.symlink(targetPath, linkPath);

      const operations = await registry.getOperations({ fileType: 'completion' });
      expect(operations).toHaveLength(1);
      expect(operations[0]).toMatchObject({
        toolName: 'test-tool',
        operationType: 'symlink',
        filePath: path.resolve(linkPath),
        targetPath: path.resolve(targetPath),
        fileType: 'completion',
      });
    });
  });

  describe('rm', () => {
    it('should track file deletion', async () => {
      const filePath = '/test/file.txt';

      // Ensure directory exists first
      await fs.mkdir('/test', { recursive: true });
      // Create file first
      await fs.writeFile(filePath, 'content');

      // Delete through tracked filesystem
      await trackedFs.rm(filePath);

      // Verify deletion was tracked
      const operations = await registry.getOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0]).toMatchObject({
        operationType: 'rm',
        filePath: path.resolve(filePath),
      });
    });

    it('should track recursive directory deletion', async () => {
      const dirPath = '/test/dir';
      const file1Path = '/test/dir/file1.txt';
      const file2Path = '/test/dir/file2.txt';

      // Create directory with files
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(file1Path, 'content1');
      await fs.writeFile(file2Path, 'content2');

      // Delete recursively through tracked filesystem
      await trackedFs.rm(dirPath, { recursive: true });

      // Verify all deletions were tracked
      const operations = await registry.getOperations();
      expect(operations).toHaveLength(3); // 2 files + directory

      const deletedPaths = operations.map((op) => op.filePath).sort();
      expect(deletedPaths).toEqual([path.resolve(dirPath), path.resolve(file1Path), path.resolve(file2Path)]);
    });
  });

  describe('chmod', () => {
    it('should track permission changes', async () => {
      const filePath = '/test/file.txt';
      const newMode = 0o755;

      // Ensure directory exists first
      await fs.mkdir('/test', { recursive: true });
      // Create file first
      await fs.writeFile(filePath, 'content');

      // Change permissions through tracked filesystem
      await trackedFs.chmod(filePath, newMode);

      // Verify permission change was tracked
      const operations = await registry.getOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0]).toMatchObject({
        operationType: 'chmod',
        filePath: path.resolve(filePath),
      });
      expect(operations[0]?.permissions).toBeDefined();
    });

    it('should store and retrieve permissions as decimal numbers', async () => {
      const filePath = '/test/file.txt';
      const mode755 = 0o755; // 493 decimal
      const mode644 = 0o644; // 420 decimal

      await fs.mkdir('/test', { recursive: true });
      await fs.writeFile(filePath, 'content');

      // Test 0o755 (rwxr-xr-x)
      await trackedFs.chmod(filePath, mode755);
      let operations = await registry.getOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0]?.permissions).toBe(493); // Decimal value

      // Reset registry
      await registry.removeToolOperations('test-tool');

      // Test 0o644 (rw-r--r--)
      await trackedFs.chmod(filePath, mode644);
      operations = await registry.getOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0]?.permissions).toBe(420); // Decimal value
    });
  });

  describe('ensureDir', () => {
    it('should track directory creation', async () => {
      const dirPath = '/test/newdir';

      // Create directory through tracked filesystem
      await trackedFs.ensureDir(dirPath);

      // Verify directory creation was tracked
      const operations = await registry.getOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0]).toMatchObject({
        operationType: 'mkdir',
        filePath: path.resolve(dirPath),
      });
      // Directory creation tracked with mkdir operation type
    });

    it('should not track when directory already exists', async () => {
      const dirPath = '/test/existingdir';

      // Ensure parent directory exists first
      await fs.mkdir('/test', { recursive: true });
      // Create directory first
      await fs.mkdir(dirPath, { recursive: true });

      // Try to ensure it exists through tracked filesystem
      await trackedFs.ensureDir(dirPath);

      // Should not track since directory already existed
      const operations = await registry.getOperations();
      expect(operations).toHaveLength(0);
    });
  });

  describe('non-modifying operations', () => {
    it('should not track read operations', async () => {
      const filePath = '/test/file.txt';
      const content = 'test content';

      // Ensure directory exists first
      await fs.mkdir('/test', { recursive: true });
      // Create file first
      await fs.writeFile(filePath, content);

      // Read through tracked filesystem
      const readContent = await trackedFs.readFile(filePath);
      expect(readContent).toBe(content);

      // Should not track read operation
      const operations = await registry.getOperations();
      expect(operations).toHaveLength(0);
    });

    it('should not track stat operations', async () => {
      const filePath = '/test/file.txt';

      // Ensure directory exists first
      await fs.mkdir('/test', { recursive: true });
      // Create file first
      await fs.writeFile(filePath, 'content');

      // Stat through tracked filesystem
      const stats = await trackedFs.stat(filePath);
      expect(stats).toBeDefined();

      // Should not track stat operation
      const operations = await registry.getOperations();
      expect(operations).toHaveLength(0);
    });

    it('should not track exists operations', async () => {
      const filePath = '/test/file.txt';

      // Check existence through tracked filesystem
      const exists = await trackedFs.exists(filePath);
      expect(exists).toBe(false);

      // Should not track exists operation
      const operations = await registry.getOperations();
      expect(operations).toHaveLength(0);
    });
  });

  describe('operation grouping', () => {
    it('should use same operation ID for related operations', async () => {
      const context = TrackedFileSystem.createContext('nodejs', 'shim');
      const trackedFs = new TrackedFileSystem(logger, fs, registry, context, '/home/test');

      // Ensure directory exists first
      await fs.mkdir('/test', { recursive: true });
      await trackedFs.writeFile('/test/file1.txt', 'content1');
      await trackedFs.writeFile('/test/file2.txt', 'content2');

      const operations = await registry.getOperations();
      expect(operations).toHaveLength(2);
      if (operations[0] && operations[1]) {
        expect(operations[0].operationId).toBe(operations[1].operationId);
        expect(operations[0].operationId).toBe(context.operationId);
      }
    });

    it('should use different operation IDs for different contexts', async () => {
      const context1 = TrackedFileSystem.createContext('nodejs', 'shim');
      const context2 = TrackedFileSystem.createContext('python', 'binary');

      const trackedFs1 = new TrackedFileSystem(logger, fs, registry, context1, '/home/test');
      const trackedFs2 = new TrackedFileSystem(logger, fs, registry, context2, '/home/test');

      // Ensure directory exists first
      await fs.mkdir('/test', { recursive: true });
      await trackedFs1.writeFile('/test/file1.txt', 'content1');
      await trackedFs2.writeFile('/test/file2.txt', 'content2');

      const operations = await registry.getOperations();
      expect(operations).toHaveLength(2);
      if (operations[0] && operations[1]) {
        expect(operations[0].operationId).not.toBe(operations[1].operationId);
      }
    });
  });
});
