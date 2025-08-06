import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IFileSystem } from '@modules/file-system';
import type { TsLogger } from '@modules/logger';
import type { IFileRegistry, FileOperation } from './IFileRegistry';
import { SuccessTemplates, DebugTemplates } from '@modules/shared/ErrorTemplates';
import { contractHomePath, formatPermissions } from '@utils';

/**
 * Context for tracking filesystem operations.
 * Passed to TrackedFileSystem to provide operation metadata.
 */
export interface TrackingContext {
  /** Tool performing the operations */
  toolName: string;
  /** Type of file being operated on */
  fileType: FileOperation['fileType'];
  /** UUID to group related operations */
  operationId: string;
  /** Additional metadata to store */
  metadata?: Record<string, unknown>;
}

/**
 * Wrapper around IFileSystem that automatically tracks all filesystem operations
 * in the file registry. Users don't need to interact with the registry directly.
 */
export class TrackedFileSystem implements IFileSystem {
  private readonly fs: IFileSystem;
  private readonly registry: IFileRegistry;
  private readonly logger: TsLogger;
  private readonly context: TrackingContext;
  private readonly homeDir: string;

  constructor(
    parentLogger: TsLogger,
    fs: IFileSystem,
    registry: IFileRegistry,
    context: TrackingContext,
    homeDir: string
  ) {
    this.logger = parentLogger.getSubLogger({ name: 'TrackedFileSystem' });
    this.fs = fs;
    this.registry = registry;
    this.context = context;
    this.homeDir = homeDir;

    this.logger.debug(DebugTemplates.registry.trackedFsCreated(), context.toolName);
  }

  /**
   * Creates a new TrackingContext with a unique operation ID.
   */
  static createContext(
    toolName: string,
    fileType: FileOperation['fileType'],
    metadata?: Record<string, unknown>
  ): TrackingContext {
    return {
      toolName,
      fileType,
      operationId: randomUUID(),
      metadata,
    };
  }

  /**
   * Creates a new TrackedFileSystem with a different context.
   * Useful for changing file type or metadata within the same tool operation.
   */
  withContext(context: Partial<TrackingContext>): TrackedFileSystem {
    const newContext: TrackingContext = {
      ...this.context,
      ...context,
    };

    return new TrackedFileSystem(this.logger, this.fs, this.registry, newContext, this.homeDir);
  }

  /**
   * Creates a new TrackedFileSystem for a specific tool.
   * This is used to attribute filesystem operations to the correct tool.
   */
  withToolName(toolName: string): TrackedFileSystem {
    return this.withContext({ toolName });
  }

  async readFile(filePath: string, encoding?: BufferEncoding): Promise<string> {
    // Read operations are not tracked since they don't modify the filesystem
    return this.fs.readFile(filePath, encoding);
  }

  async writeFile(filePath: string, content: string | NodeJS.ArrayBufferView, encoding?: BufferEncoding): Promise<void> {
    
    const fileExists = await this.fs.exists(filePath);
    const operationType = fileExists ? 'update' : 'create';

    // Perform the actual file operation
    await this.fs.writeFile(filePath, content, encoding);

    // Get file stats for tracking
    const stats = await this.getFileStats(filePath);

    // Record the operation
    await this.registry.recordOperation({
      toolName: this.context.toolName,
      operationType,
      filePath: path.resolve(filePath),
      fileType: this.context.fileType,
      operationId: this.context.operationId,
      metadata: this.context.metadata,
      sizeBytes: stats?.sizeBytes,
      permissions: stats?.permissions,
    });

    // Log user-facing filesystem changes
    if (operationType === 'create') {
      this.logger.info(SuccessTemplates.fs.created(this.context.toolName, contractHomePath(this.homeDir, filePath)));
    } else {
      this.logger.info(SuccessTemplates.fs.updated(this.context.toolName, contractHomePath(this.homeDir, filePath)));
    }
  }

  // Note: appendFile is not in IFileSystem interface, removing it

  async copyFile(src: string, dest: string, flags?: number): Promise<void> {
    
    // Perform the actual operation
    await this.fs.copyFile(src, dest, flags);

    // Get file stats for tracking
    const stats = await this.getFileStats(dest);

    // Record the operation
    await this.registry.recordOperation({
      toolName: this.context.toolName,
      operationType: 'create',
      filePath: path.resolve(dest),
      fileType: this.context.fileType,
      operationId: this.context.operationId,
      metadata: { 
        ...this.context.metadata, 
        copiedFrom: path.resolve(src) 
      },
      sizeBytes: stats?.sizeBytes,
      permissions: stats?.permissions,
    });

    this.logger.info(SuccessTemplates.fs.copied(this.context.toolName, contractHomePath(this.homeDir, src), contractHomePath(this.homeDir, dest)));
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    
    // Record deletion of source
    if (await this.fs.exists(oldPath)) {
      await this.registry.recordOperation({
        toolName: this.context.toolName,
        operationType: 'delete',
        filePath: path.resolve(oldPath),
        fileType: this.context.fileType,
        operationId: this.context.operationId,
        metadata: this.context.metadata,
      });
    }

    // Perform the actual operation
    await this.fs.rename(oldPath, newPath);

    // Get file stats for tracking
    const stats = await this.getFileStats(newPath);

    // Record creation of destination
    await this.registry.recordOperation({
      toolName: this.context.toolName,
      operationType: 'create',
      filePath: path.resolve(newPath),
      fileType: this.context.fileType,
      operationId: this.context.operationId,
      metadata: { 
        ...this.context.metadata, 
        renamedFrom: path.resolve(oldPath) 
      },
      sizeBytes: stats?.sizeBytes,
      permissions: stats?.permissions,
    });

    this.logger.info(SuccessTemplates.fs.moved(this.context.toolName, contractHomePath(this.homeDir, oldPath), contractHomePath(this.homeDir, newPath)));
  }

  async symlink(target: string, linkPath: string, type?: 'file' | 'dir' | 'junction'): Promise<void> {
    
    // Perform the actual operation
    await this.fs.symlink(target, linkPath, type);

    // Record the operation
    await this.registry.recordOperation({
      toolName: this.context.toolName,
      operationType: 'symlink',
      filePath: path.resolve(linkPath),
      targetPath: path.resolve(target),
      fileType: 'symlink', // Symlinks always have type 'symlink'
      operationId: this.context.operationId,
      metadata: this.context.metadata,
    });

    this.logger.info(SuccessTemplates.fs.symlinkCreated(this.context.toolName, contractHomePath(this.homeDir, linkPath), contractHomePath(this.homeDir, target)));
  }

  async rm(filePath: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    
    // If removing recursively, we need to track all files being removed
    if (options?.recursive && await this.fs.exists(filePath)) {
      const stat = await this.fs.stat(filePath);
      if (stat.isDirectory()) {
        await this.trackDirectoryDeletion(filePath);
      } else {
        await this.trackFileDeletion(filePath);
      }
    } else if (await this.fs.exists(filePath)) {
      await this.trackFileDeletion(filePath);
    }

    // Perform the actual operation
    await this.fs.rm(filePath, options);

    if (options?.recursive) {
      this.logger.info(SuccessTemplates.fs.removed(this.context.toolName, contractHomePath(this.homeDir, filePath)));
    } else {
      this.logger.info(SuccessTemplates.fs.removed(this.context.toolName, contractHomePath(this.homeDir, filePath)));
    }
  }

  async chmod(filePath: string, mode: string | number): Promise<void> {
    
    // Perform the actual operation
    await this.fs.chmod(filePath, mode);

    // Get updated file stats
    const stats = await this.getFileStats(filePath);

    // Record as update operation
    await this.registry.recordOperation({
      toolName: this.context.toolName,
      operationType: 'update',
      filePath: path.resolve(filePath),
      fileType: this.context.fileType,
      operationId: this.context.operationId,
      metadata: { 
        ...this.context.metadata, 
        permissionChange: true, 
        newMode: mode 
      },
      permissions: stats?.permissions,
    });

    this.logger.info(SuccessTemplates.fs.permissionsChanged(this.context.toolName, contractHomePath(this.homeDir, filePath), formatPermissions(mode)));
  }

  // Non-modifying operations - these don't need tracking
  async exists(filePath: string): Promise<boolean> {
    return this.fs.exists(filePath);
  }

  async stat(filePath: string): Promise<any> {
    return this.fs.stat(filePath);
  }

  async lstat(filePath: string): Promise<any> {
    return this.fs.lstat(filePath);
  }

  async readlink(filePath: string): Promise<string> {
    return this.fs.readlink(filePath);
  }

  async readdir(dirPath: string): Promise<string[]> {
    return this.fs.readdir(dirPath);
  }

  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    
    const existed = await this.fs.exists(dirPath);
    
    // Perform the actual operation
    await this.fs.mkdir(dirPath, options);

    // Only track if directory was actually created
    if (!existed) {
      await this.registry.recordOperation({
        toolName: this.context.toolName,
        operationType: 'create',
        filePath: path.resolve(dirPath),
        fileType: this.context.fileType,
        operationId: this.context.operationId,
        metadata: { ...this.context.metadata, isDirectory: true },
      });

      this.logger.info(SuccessTemplates.fs.directoryCreated(this.context.toolName, contractHomePath(this.homeDir, dirPath)));
    }
  }

  async rmdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'rmdir' });
    
    // Track directory deletion
    if (await this.fs.exists(dirPath)) {
      if (options?.recursive) {
        await this.trackDirectoryDeletion(dirPath);
      } else {
        await this.trackFileDeletion(dirPath);
      }
    }

    // Perform the actual operation
    await this.fs.rmdir(dirPath, options);

    logger.debug(DebugTemplates.registry.rmdirTracked(), dirPath);
  }

  async ensureDir(dirPath: string): Promise<void> {
    
    const existed = await this.fs.exists(dirPath);
    
    // Perform the actual operation
    await this.fs.ensureDir(dirPath);

    // Only track if directory was actually created
    if (!existed) {
      await this.registry.recordOperation({
        toolName: this.context.toolName,
        operationType: 'create',
        filePath: path.resolve(dirPath),
        fileType: this.context.fileType,
        operationId: this.context.operationId,
        metadata: { ...this.context.metadata, isDirectory: true },
      });

      this.logger.info(SuccessTemplates.fs.directoryCreated(this.context.toolName, contractHomePath(this.homeDir, dirPath)));
    }
  }

  /**
   * Helper method to get file stats for tracking purposes.
   */
  private async getFileStats(filePath: string): Promise<{ sizeBytes: number; permissions: number } | null> {
    try {
      const stats = await this.fs.stat(filePath);
      return {
        sizeBytes: stats.size,
        permissions: stats.mode & 0o777,
      };
    } catch {
      return null;
    }
  }

  /**
   * Tracks deletion of a single file.
   */
  private async trackFileDeletion(filePath: string): Promise<void> {
    await this.registry.recordOperation({
      toolName: this.context.toolName,
      operationType: 'delete',
      filePath: path.resolve(filePath),
      fileType: this.context.fileType,
      operationId: this.context.operationId,
      metadata: this.context.metadata,
    });
  }

  /**
   * Recursively tracks deletion of a directory and all its contents.
   */
  private async trackDirectoryDeletion(dirPath: string): Promise<void> {
    try {
      const entries = await this.fs.readdir(dirPath);
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry);
        const stat = await this.fs.stat(fullPath);
        
        if (stat.isDirectory()) {
          await this.trackDirectoryDeletion(fullPath);
        } else {
          await this.trackFileDeletion(fullPath);
        }
      }
      
      // Track the directory itself
      await this.trackFileDeletion(dirPath);
    } catch (error) {
      this.logger.debug(DebugTemplates.registry.directoryDeletionError(), dirPath, (error as Error).message);
    }
  }
}