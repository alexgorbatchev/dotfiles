/**
 * Represents a filesystem operation recorded in the registry.
 */
export interface IFileOperation {
  /** Unique ID for this operation */
  id: number;
  /** Tool that performed the operation */
  toolName: string;
  /** Type of operation performed */
  operationType: "writeFile" | "chmod" | "rm" | "mkdir" | "symlink" | "rename" | "cp";
  /** Full path to the file */
  filePath: string;
  /** Target path for symlinks */
  targetPath?: string;
  /** Type of file being operated on */
  fileType: "shim" | "binary" | "symlink" | "copy" | "config" | "completion" | "init" | "hook-generated" | "catalog";
  /** Additional metadata as JSON */
  metadata?: Record<string, unknown>;
  /** File size in bytes */
  sizeBytes?: number;
  /** File permissions */
  permissions?: number;
  /** When the operation was performed (Unix timestamp) */
  createdAt: number;
  /** UUID to group related operations */
  operationId: string;
}

/**
 * Filter criteria for querying file operations.
 */
export interface IFileOperationFilter {
  /** Filter by tool name */
  toolName?: string;
  /** Filter by operation type */
  operationType?: IFileOperation["operationType"];
  /** Filter by file type */
  fileType?: IFileOperation["fileType"];
  /** Filter by file path (exact match) */
  filePath?: string;
  /** Filter by operations after this timestamp */
  createdAfter?: number;
  /** Filter by operations before this timestamp */
  createdBefore?: number;
  /** Filter by operation ID */
  operationId?: string;
}

/**
 * Current state of a file based on registry operations.
 */
export interface IFileState {
  /** File path */
  filePath: string;
  /** Tool that owns this file */
  toolName: string;
  /** Current file type */
  fileType: IFileOperation["fileType"];
  /** Last operation performed on this file */
  lastOperation: IFileOperation["operationType"];
  /** Target path for symlinks */
  targetPath?: string;
  /** Last modification timestamp */
  lastModified: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** File size in bytes */
  sizeBytes?: number;
  /** File permissions */
  permissions?: number;
}

/**
 * Interface for tracking filesystem operations in an append-only registry.
 */
export interface IFileRegistry {
  /**
   * Records a filesystem operation in the registry.
   */
  recordOperation(operation: Omit<IFileOperation, "id" | "createdAt">): Promise<void>;

  /**
   * Retrieves all operations matching the given filter.
   */
  getOperations(filter?: IFileOperationFilter): Promise<IFileOperation[]>;

  /**
   * Gets the current state of all files for a given tool.
   * This computes the final state by processing all operations chronologically.
   */
  getFileStatesForTool(toolName: string): Promise<IFileState[]>;

  /**
   * Gets the current state of a specific file.
   * Returns null if the file has no recorded operations.
   */
  getFileState(filePath: string): Promise<IFileState | null>;

  /**
   * Gets all tools that have registered files.
   */
  getRegisteredTools(): Promise<string[]>;

  /**
   * Removes all operations for a specific tool.
   * Used when completely uninstalling a tool.
   */
  removeToolOperations(toolName: string): Promise<void>;

  /**
   * Compacts the registry by removing obsolete operations.
   * For example, if a file was created then deleted, both operations can be removed.
   */
  compact(): Promise<void>;

  /**
   * Validates registry integrity and repairs any issues found.
   */
  validate(): Promise<{ valid: boolean; issues: string[]; repaired: string[] }>;

  /**
   * Gets registry statistics.
   */
  getStats(): Promise<{
    totalOperations: number;
    totalFiles: number;
    totalTools: number;
    oldestOperation: number;
    newestOperation: number;
  }>;

  /**
   * Closes the registry and releases any resources.
   */
  close(): Promise<void>;
}
