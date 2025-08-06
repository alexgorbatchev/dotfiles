import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { TestLogger, createMemFileSystem } from '@testing-helpers';
import { TrackedFileSystem, type TrackingContext } from '../TrackedFileSystem';
import { SqliteFileRegistry } from '../SqliteFileRegistry';
import type { IFileSystem } from '@modules/file-system';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { unlink } from 'node:fs/promises';

describe('TrackedFileSystem', () => {
  let logger: TestLogger;
  let fs: IFileSystem;
  let registry: SqliteFileRegistry;
  let trackedFs: TrackedFileSystem;
  let context: TrackingContext;
  let dbPath: string;

  beforeEach(async () => {
    logger = new TestLogger();
    const { fs: memFs } = await createMemFileSystem();
    fs = memFs;
    
    dbPath = path.join('/tmp', `test-tracked-fs-${randomUUID()}.db`);
    registry = new SqliteFileRegistry(logger, dbPath);
    
    context = TrackedFileSystem.createContext('test-tool', 'shim');
    trackedFs = new TrackedFileSystem(logger, fs, registry, context, '/home/test');
  });

  afterEach(async () => {
    await registry.close();
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
        operationType: 'create',
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
      expect(operations[0]?.operationType).toBe('update');
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
        operationType: 'create',
        filePath: path.resolve(destPath),
      });
      expect(operations[0]?.metadata?.['copiedFrom']).toBe(path.resolve(srcPath));
    });
  });

  describe('rename', () => {
    it('should track file renaming as delete + create', async () => {
      const oldPath = '/test/old.txt';
      const newPath = '/test/new.txt';
      const content = 'test content';

      // Ensure directory exists first
      await fs.mkdir('/test', { recursive: true });
      // Create file
      await fs.writeFile(oldPath, content);

      // Rename through tracked filesystem
      await trackedFs.rename(oldPath, newPath);

      // Verify both operations were tracked
      const operations = await registry.getOperations();
      expect(operations).toHaveLength(2);
      
      // Should have delete operation for old path
      const deleteOp = operations.find(op => op.operationType === 'delete');
      expect(deleteOp).toBeDefined();
      if (deleteOp) {
        expect(deleteOp.filePath).toBe(path.resolve(oldPath));
      }

      // Should have create operation for new path
      const createOp = operations.find(op => op.operationType === 'create');
      expect(createOp).toBeDefined();
      if (createOp) {
        expect(createOp.filePath).toBe(path.resolve(newPath));
        expect(createOp.metadata?.['renamedFrom']).toBe(path.resolve(oldPath));
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
        fileType: 'symlink', // Symlinks always have type 'symlink'
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
        operationType: 'delete',
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

      const deletedPaths = operations.map(op => op.filePath).sort();
      expect(deletedPaths).toEqual([
        path.resolve(dirPath),
        path.resolve(file1Path),
        path.resolve(file2Path),
      ]);
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
        operationType: 'update',
        filePath: path.resolve(filePath),
      });
      expect(operations[0]?.metadata?.['permissionChange']).toBe(true);
      expect(operations[0]?.metadata?.['newMode']).toBe(newMode);
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
        operationType: 'create',
        filePath: path.resolve(dirPath),
      });
      expect(operations[0]?.metadata?.['isDirectory']).toBe(true);
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