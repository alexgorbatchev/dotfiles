import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { IFileSystem, Stats } from '@dotfiles/file-system';
import type { SafeLogMessage, TsLogger } from '@dotfiles/logger';
import { contractHomePath, formatPermissions } from '@dotfiles/utils';
import type { FileOperation, IFileRegistry } from './IFileRegistry';
import { messages } from './log-messages';

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
  private suppressLogging = false;

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

    const newInstance = new TrackedFileSystem(this.logger, this.fs, this.registry, newContext, this.homeDir);
    // Preserve the suppressLogging setting
    newInstance.setSuppressLogging(this.suppressLogging);
    return newInstance;
  }

  /**
   * Temporarily suppress logging for this TrackedFileSystem instance
   */
  setSuppressLogging(suppress: boolean): void {
    this.suppressLogging = suppress;
  }

  /**
   * Log info message only if logging is not suppressed
   */
  private logInfo(message: SafeLogMessage): void {
    if (!this.suppressLogging) {
      this.logger.info(message);
    }
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

  async readFileBuffer(filePath: string): Promise<Buffer> {
    // Read operations are not tracked since they don't modify the filesystem
    return this.fs.readFileBuffer(filePath);
  }

  async writeFile(
    filePath: string,
    content: string | NodeJS.ArrayBufferView,
    encoding?: BufferEncoding
  ): Promise<void> {
    const fileExists = await this.fs.exists(filePath);
    let contentChanged = true;

    // Check if content is identical to avoid unnecessary write
    if (fileExists) {
      try {
        const existingContent = await this.fs.readFile(filePath, encoding || 'utf8');
        const newContent = typeof content === 'string' ? content : content.toString();
        contentChanged = existingContent !== newContent;
      } catch {
        // If we can't read the file, assume content is different
        contentChanged = true;
      }
    }

    if (!contentChanged) {
      // Content is identical, skip the write operation
      return;
    }

    // Perform the actual file operation
    await this.fs.writeFile(filePath, content, encoding);

    // Get file stats for tracking
    const stats = await this.getFileStats(filePath);

    // Record the operation
    await this.registry.recordOperation({
      toolName: this.context.toolName,
      operationType: 'writeFile',
      filePath: path.resolve(filePath),
      fileType: this.context.fileType,
      operationId: this.context.operationId,
      metadata: this.context.metadata,
      sizeBytes: stats?.sizeBytes,
      permissions: stats?.permissions,
    });

    // Log user-facing filesystem changes
    if (!fileExists) {
      this.logInfo(messages.fileCreated(this.context.toolName, contractHomePath(this.homeDir, filePath)));
    } else {
      this.logInfo(messages.fileUpdated(this.context.toolName, contractHomePath(this.homeDir, filePath)));
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
      operationType: 'cp',
      filePath: path.resolve(dest),
      targetPath: path.resolve(src),
      fileType: this.context.fileType,
      operationId: this.context.operationId,
      metadata: this.context.metadata,
      sizeBytes: stats?.sizeBytes,
      permissions: stats?.permissions,
    });

    this.logInfo(
      messages.fileCopied(
        this.context.toolName,
        contractHomePath(this.homeDir, src),
        contractHomePath(this.homeDir, dest)
      )
    );
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    // Perform the actual operation
    await this.fs.rename(oldPath, newPath);

    // Get file stats for tracking
    const stats = await this.getFileStats(newPath);

    // Record the rename operation
    await this.registry.recordOperation({
      toolName: this.context.toolName,
      operationType: 'rename',
      filePath: path.resolve(newPath),
      targetPath: path.resolve(oldPath),
      fileType: this.context.fileType,
      operationId: this.context.operationId,
      metadata: this.context.metadata,
      sizeBytes: stats?.sizeBytes,
      permissions: stats?.permissions,
    });

    this.logInfo(
      messages.fileMoved(
        this.context.toolName,
        contractHomePath(this.homeDir, oldPath),
        contractHomePath(this.homeDir, newPath)
      )
    );
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

    this.logInfo(
      messages.symlinkCreated(
        this.context.toolName,
        contractHomePath(this.homeDir, linkPath),
        contractHomePath(this.homeDir, target)
      )
    );
  }

  async rm(filePath: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    // If removing recursively, we need to track all files being removed
    if (options?.recursive && (await this.fs.exists(filePath))) {
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
      this.logInfo(messages.fileRemoved(this.context.toolName, contractHomePath(this.homeDir, filePath)));
    } else {
      this.logInfo(messages.fileRemoved(this.context.toolName, contractHomePath(this.homeDir, filePath)));
    }
  }

  async chmod(filePath: string, mode: string | number): Promise<void> {
    // Perform the actual operation
    await this.fs.chmod(filePath, mode);

    // Get updated file stats
    const stats = await this.getFileStats(filePath);

    // Record as chmod operation
    await this.registry.recordOperation({
      toolName: this.context.toolName,
      operationType: 'chmod',
      filePath: path.resolve(filePath),
      fileType: this.context.fileType,
      operationId: this.context.operationId,
      metadata: this.context.metadata,
      permissions: stats?.permissions,
    });

    this.logInfo(
      messages.permissionsChanged(
        this.context.toolName,
        contractHomePath(this.homeDir, filePath),
        formatPermissions(mode)
      )
    );
  }

  // Non-modifying operations - these don't need tracking
  async exists(filePath: string): Promise<boolean> {
    return this.fs.exists(filePath);
  }

  async stat(filePath: string): Promise<Stats> {
    return this.fs.stat(filePath);
  }

  async lstat(filePath: string): Promise<Stats> {
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
        operationType: 'mkdir',
        filePath: path.resolve(dirPath),
        fileType: this.context.fileType,
        operationId: this.context.operationId,
        metadata: this.context.metadata,
      });

      this.logInfo(messages.directoryCreated(this.context.toolName, contractHomePath(this.homeDir, dirPath)));
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

    logger.debug(messages.rmdirTracked(), dirPath);
  }

  async ensureDir(dirPath: string): Promise<void> {
    const existed = await this.fs.exists(dirPath);

    // Perform the actual operation
    await this.fs.ensureDir(dirPath);

    // Only track if directory was actually created
    if (!existed) {
      await this.registry.recordOperation({
        toolName: this.context.toolName,
        operationType: 'mkdir',
        filePath: path.resolve(dirPath),
        fileType: this.context.fileType,
        operationId: this.context.operationId,
        metadata: this.context.metadata,
      });

      this.logInfo(messages.directoryCreated(this.context.toolName, contractHomePath(this.homeDir, dirPath)));
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
      operationType: 'rm',
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
      this.logger.debug(
        messages.directoryDeletionError(),
        dirPath,
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
