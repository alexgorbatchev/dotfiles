import type { ProjectConfig } from "@dotfiles/core";
import type { IResolvedFileSystem, Stats } from "@dotfiles/file-system";
import { resolvedFileSystemBrand } from "@dotfiles/file-system";
import type { SafeLogMessage, TsLogger } from "@dotfiles/logger";
import { contractHomePath, formatPermissions } from "@dotfiles/utils";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { IFileOperation, IFileRegistry } from "./IFileRegistry";
import { messages } from "./log-messages";

/**
 * Context for tracking filesystem operations.
 * Passed to TrackedFileSystem to provide operation metadata.
 */
export interface ITrackingContext {
  /** Tool performing the operations */
  toolName: string;
  /** Type of file being operated on */
  fileType: IFileOperation["fileType"];
  /** UUID to group related operations */
  operationId: string;
  /** Additional metadata to store */
  metadata?: Record<string, unknown>;
}

/**
 * Wrapper around IFileSystem that automatically tracks all filesystem operations
 * in the file registry. Users don't need to interact with the registry directly.
 */
export class TrackedFileSystem implements IResolvedFileSystem {
  readonly [resolvedFileSystemBrand] = true as const;

  private readonly fs: IResolvedFileSystem;
  private readonly registry: IFileRegistry;
  private readonly logger: TsLogger;
  private readonly parentLogger: TsLogger;
  private readonly context: ITrackingContext;
  private readonly projectConfig: ProjectConfig;
  private suppressLogging = false;

  constructor(
    parentLogger: TsLogger,
    fs: IResolvedFileSystem,
    registry: IFileRegistry,
    context: ITrackingContext,
    projectConfig: ProjectConfig,
  ) {
    this.parentLogger = parentLogger;
    this.logger = parentLogger.getSubLogger({ name: "TrackedFileSystem", context: context.toolName });
    this.fs = fs;
    this.registry = registry;
    this.context = context;
    this.projectConfig = projectConfig;
  }

  /**
   * Creates a new ITrackingContext with a unique operation ID.
   */
  static createContext(
    toolName: string,
    fileType: IFileOperation["fileType"],
    metadata?: Record<string, unknown>,
  ): ITrackingContext {
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
  withContext(context: Partial<ITrackingContext>): TrackedFileSystem {
    const newContext: ITrackingContext = {
      ...this.context,
      ...context,
    };

    const newInstance = new TrackedFileSystem(
      this.parentLogger,
      this.fs,
      this.registry,
      newContext,
      this.projectConfig,
    );
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
   * Creates a logger with context set to the tool name for prefixed log output.
   */
  withToolName(toolName: string): TrackedFileSystem {
    return this.withContext({ toolName });
  }

  /**
   * Creates a new TrackedFileSystem for a specific file type.
   * This is used to attribute filesystem operations to the correct file type.
   */
  withFileType(fileType: IFileOperation["fileType"]): TrackedFileSystem {
    return this.withContext({ fileType });
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
    encoding?: BufferEncoding,
  ): Promise<void> {
    const fileExists = await this.fs.exists(filePath);
    let contentChanged = true;

    // Check if content is identical to avoid unnecessary write
    if (fileExists) {
      try {
        const existingContent = await this.fs.readFile(filePath, encoding || "utf8");
        const newContent = typeof content === "string" ? content : content.toString();
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
    await this.recordOperation("writeFile", filePath, {
      sizeBytes: stats?.sizeBytes,
      permissions: stats?.permissions,
    });

    // Log user-facing filesystem changes
    if (!fileExists) {
      this.logInfo(messages.fileCreated(contractHomePath(this.projectConfig.paths.homeDir, filePath)));
    } else {
      this.logInfo(messages.fileUpdated(contractHomePath(this.projectConfig.paths.homeDir, filePath)));
    }
  }

  // Note: appendFile is not in IFileSystem interface, removing it

  async copyFile(src: string, dest: string, flags?: number): Promise<void> {
    // Perform the actual operation
    await this.fs.copyFile(src, dest, flags);

    // Get file stats for tracking
    const stats = await this.getFileStats(dest);

    // Record the operation
    await this.recordOperation("cp", dest, {
      targetPath: src,
      sizeBytes: stats?.sizeBytes,
      permissions: stats?.permissions,
    });

    this.logInfo(
      messages.fileCopied(
        contractHomePath(this.projectConfig.paths.homeDir, src),
        contractHomePath(this.projectConfig.paths.homeDir, dest),
      ),
    );
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    // Perform the actual operation
    await this.fs.rename(oldPath, newPath);

    // Get file stats for tracking
    const stats = await this.getFileStats(newPath);

    // Record the rename operation
    await this.recordOperation("rename", newPath, {
      targetPath: oldPath,
      sizeBytes: stats?.sizeBytes,
      permissions: stats?.permissions,
    });

    this.logInfo(
      messages.fileMoved(
        contractHomePath(this.projectConfig.paths.homeDir, oldPath),
        contractHomePath(this.projectConfig.paths.homeDir, newPath),
      ),
    );
  }

  async symlink(target: string, linkPath: string, type?: "file" | "dir" | "junction"): Promise<void> {
    // Perform the actual operation
    await this.fs.symlink(target, linkPath, type);

    // Record the operation using context fileType (e.g., 'completion', 'symlink', 'binary')
    await this.recordOperation("symlink", linkPath, { targetPath: target });

    this.logInfo(
      messages.symlinkCreated(
        contractHomePath(this.projectConfig.paths.homeDir, linkPath),
        contractHomePath(this.projectConfig.paths.homeDir, target),
      ),
    );
  }

  /**
   * Records an existing symlink in the registry without creating it on disk.
   * Used when a symlink already exists and is correct, but needs to be tracked.
   * Skips recording if the symlink is already registered with the same target.
   *
   * @param target - The target path the symlink points to.
   * @param linkPath - The path of the symlink.
   */
  async recordExistingSymlink(target: string, linkPath: string): Promise<void> {
    const resolvedLinkPath = path.resolve(linkPath);
    const resolvedTarget = path.resolve(target);

    // Check if symlink is already registered with the same target
    const existingState = await this.registry.getFileState(resolvedLinkPath);
    if (existingState && existingState.targetPath === resolvedTarget) {
      // Already registered with correct target, skip
      return;
    }

    // Record the symlink operation
    await this.recordOperation("symlink", linkPath, { targetPath: target });
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

    this.logInfo(messages.fileRemoved(contractHomePath(this.projectConfig.paths.homeDir, filePath)));
  }

  async chmod(filePath: string, mode: string | number): Promise<void> {
    // Perform the actual operation
    await this.fs.chmod(filePath, mode);

    // Get updated file stats
    const stats = await this.getFileStats(filePath);

    // Record as chmod operation
    await this.recordOperation("chmod", filePath, { permissions: stats?.permissions });

    this.logInfo(
      messages.permissionsChanged(
        contractHomePath(this.projectConfig.paths.homeDir, filePath),
        formatPermissions(mode),
      ),
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
      await this.recordOperation("mkdir", dirPath);

      this.logInfo(messages.directoryCreated(contractHomePath(this.projectConfig.paths.homeDir, dirPath)));
    }
  }

  async rmdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    const logger = this.logger.getSubLogger({ name: "rmdir" });

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
      await this.recordOperation("mkdir", dirPath);

      this.logInfo(messages.directoryCreated(contractHomePath(this.projectConfig.paths.homeDir, dirPath)));
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
   * Helper method to record a file operation with common context fields.
   */
  private async recordOperation(
    operationType: IFileOperation["operationType"],
    filePath: string,
    options?: {
      targetPath?: string;
      sizeBytes?: number;
      permissions?: number;
    },
  ): Promise<void> {
    await this.registry.recordOperation({
      toolName: this.context.toolName,
      operationType,
      filePath: path.resolve(filePath),
      fileType: this.context.fileType,
      operationId: this.context.operationId,
      metadata: this.context.metadata,
      targetPath: options?.targetPath ? path.resolve(options.targetPath) : undefined,
      sizeBytes: options?.sizeBytes,
      permissions: options?.permissions,
    });
  }

  /**
   * Tracks deletion of a single file.
   */
  private async trackFileDeletion(filePath: string): Promise<void> {
    await this.recordOperation("rm", filePath);
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
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
