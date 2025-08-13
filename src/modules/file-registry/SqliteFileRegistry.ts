import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import type { FileOperation, FileOperationFilter, FileState, IFileRegistry } from './IFileRegistry';

interface DatabaseRow {
  id: number;
  tool_name: string;
  operation_type: FileOperation['operationType'];
  file_path: string;
  target_path: string | null;
  file_type: FileOperation['fileType'];
  metadata: string | null;
  size_bytes: number | null;
  permissions: string | null;
  created_at: string;
  operation_id: string;
}

/**
 * SQLite-based implementation of the file registry.
 * Uses append-only design for crash safety.
 */
export class SqliteFileRegistry implements IFileRegistry {
  private readonly db: Database;
  private readonly logger: TsLogger;

  constructor(parentLogger: TsLogger, dbPath: string) {
    this.logger = parentLogger.getSubLogger({ name: 'SqliteFileRegistry' });

    // Ensure the parent directory exists
    const dbDir = dirname(dbPath);
    try {
      mkdirSync(dbDir, { recursive: true });
    } catch (_error) {
      // Directory might already exist, which is fine
    }

    this.db = new Database(dbPath);
    this.initializeSchema();
    this.logger.debug(logs.registry.debug.initialized(), dbPath);
  }

  async recordOperation(operation: Omit<FileOperation, 'id' | 'createdAt'>): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'recordOperation' });

    const stmt = this.db.prepare(`
      INSERT INTO file_operations (
        tool_name, operation_type, file_path, target_path, file_type,
        metadata, size_bytes, permissions, created_at, operation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    const metadataJson = operation.metadata ? JSON.stringify(operation.metadata) : null;

    stmt.run(
      operation.toolName,
      operation.operationType,
      operation.filePath,
      operation.targetPath || null,
      operation.fileType,
      metadataJson,
      operation.sizeBytes || null,
      operation.permissions || null,
      now,
      operation.operationId
    );

    logger.debug(
      logs.registry.debug.operationRecorded(),
      operation.operationType,
      operation.toolName,
      operation.filePath
    );
  }

  async getOperations(filter: FileOperationFilter = {}): Promise<FileOperation[]> {
    const logger = this.logger.getSubLogger({ name: 'getOperations' });

    let sql = 'SELECT * FROM file_operations WHERE 1=1';
    const params: (string | number)[] = [];

    if (filter.toolName) {
      sql += ' AND tool_name = ?';
      params.push(filter.toolName);
    }

    if (filter.operationType) {
      sql += ' AND operation_type = ?';
      params.push(filter.operationType);
    }

    if (filter.fileType) {
      sql += ' AND file_type = ?';
      params.push(filter.fileType);
    }

    if (filter.filePath) {
      sql += ' AND file_path = ?';
      params.push(filter.filePath);
    }

    if (filter.createdAfter) {
      sql += ' AND created_at > ?';
      params.push(filter.createdAfter);
    }

    if (filter.createdBefore) {
      sql += ' AND created_at < ?';
      params.push(filter.createdBefore);
    }

    if (filter.operationId) {
      sql += ' AND operation_id = ?';
      params.push(filter.operationId);
    }

    sql += ' ORDER BY created_at DESC, id DESC';

    const stmt = this.db.prepare(sql);
    const rows = params.length > 0 ? (stmt.all(...params) as DatabaseRow[]) : (stmt.all() as DatabaseRow[]);

    logger.debug(logs.registry.debug.operationsRetrieved(), rows.length, filter);

    return rows.map((row) => ({
      id: row.id,
      toolName: row.tool_name,
      operationType: row.operation_type,
      filePath: row.file_path,
      targetPath: row.target_path ?? undefined,
      fileType: row.file_type,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      sizeBytes: row.size_bytes ?? undefined,
      permissions: row.permissions ? parseInt(row.permissions, 8) : undefined,
      createdAt: parseInt(row.created_at),
      operationId: row.operation_id,
    }));
  }

  async getFileStatesForTool(toolName: string): Promise<FileState[]> {
    const logger = this.logger.getSubLogger({ name: 'getFileStatesForTool' });

    // Get all operations for this tool, ordered reverse chronologically (newest first)
    const operations = await this.getOperations({ toolName });
    const fileStates = new Map<string, FileState>();

    // Process operations chronologically (oldest first) - create a copy to reverse
    for (const op of [...operations].reverse()) {
      if (op.operationType === 'rm') {
        // Mark file as deleted by removing it from the map
        fileStates.delete(op.filePath);
      } else {
        // Create or update file state
        fileStates.set(op.filePath, {
          filePath: op.filePath,
          toolName: op.toolName,
          fileType: op.fileType,
          lastOperation: op.operationType,
          targetPath: op.targetPath,
          lastModified: op.createdAt,
          metadata: op.metadata,
          sizeBytes: op.sizeBytes,
          permissions: op.permissions,
        });
      }
    }

    // Return all active file states
    const activeStates = Array.from(fileStates.values());

    logger.debug(logs.registry.debug.fileStatesComputed(), activeStates.length, toolName);

    return activeStates;
  }

  async getFileState(filePath: string): Promise<FileState | null> {
    const logger = this.logger.getSubLogger({ name: 'getFileState' });

    // Get all operations for this file path, ordered reverse chronologically (newest first)
    const operations = await this.getOperations({ filePath });

    if (operations.length === 0) {
      logger.debug(logs.registry.debug.noOperationsFound(), filePath);
      return null;
    }

    // Process operations chronologically (oldest first) to get final state
    let state: FileState | null = null;

    for (const op of [...operations].reverse()) {
      if (op.operationType === 'rm') {
        // File was deleted
        state = null;
      } else {
        // File was created/updated
        state = {
          filePath: op.filePath,
          toolName: op.toolName,
          fileType: op.fileType,
          lastOperation: op.operationType,
          targetPath: op.targetPath,
          lastModified: op.createdAt,
          metadata: op.metadata,
          sizeBytes: op.sizeBytes,
          permissions: op.permissions,
        };
      }
    }

    logger.debug(logs.registry.debug.fileStateComputed(), filePath, state ? 'active' : 'deleted');

    return state;
  }

  async getRegisteredTools(): Promise<string[]> {
    const stmt = this.db.prepare('SELECT DISTINCT tool_name FROM file_operations ORDER BY tool_name');
    const rows = stmt.all() as { tool_name: string }[];

    const tools = rows.map((row) => row.tool_name);
    this.logger.debug(logs.registry.debug.toolsFound(), tools.length);

    return tools;
  }

  async removeToolOperations(toolName: string): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'removeToolOperations' });

    const stmt = this.db.prepare('DELETE FROM file_operations WHERE tool_name = ?');
    const result = stmt.run(toolName);

    logger.debug(logs.registry.debug.operationsRemoved(), result.changes, toolName);
  }

  async compact(): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'compact' });

    // This is a simplified compaction - in a full implementation,
    // we would analyze operation patterns and remove redundant entries
    const before = await this.getStats();

    // For now, just clean up any operations for files that were ultimately deleted
    const deletedFiles = await this.getOperations({ operationType: 'rm' });

    for (const deleteOp of deletedFiles) {
      // Remove all operations for this file if the final state is deleted
      const finalState = await this.getFileState(deleteOp.filePath);

      if (!finalState) {
        // File is ultimately deleted, remove all its operations
        const stmt = this.db.prepare('DELETE FROM file_operations WHERE file_path = ?');
        stmt.run(deleteOp.filePath);
      }
    }

    const after = await this.getStats();
    logger.debug(logs.registry.debug.compactionComplete(), before.totalOperations, after.totalOperations);
  }

  async validate(): Promise<{ valid: boolean; issues: string[]; repaired: string[] }> {
    const logger = this.logger.getSubLogger({ name: 'validate' });
    const issues: string[] = [];
    const repaired: string[] = [];

    // Check for duplicate operation IDs within the same transaction
    const duplicateIds = this.db
      .prepare(`
      SELECT operation_id, COUNT(*) as count 
      FROM file_operations 
      GROUP BY operation_id 
      HAVING count > 1
    `)
      .all() as { operation_id: string; count: number }[];

    if (duplicateIds.length > 0) {
      issues.push(`Found ${duplicateIds.length} duplicate operation IDs`);
    }

    // Check for orphaned symlinks (symlinks with missing targets)
    const symlinks = await this.getOperations({ operationType: 'symlink' });
    for (const symlink of symlinks) {
      if (symlink.targetPath) {
        const targetState = await this.getFileState(symlink.targetPath);
        if (!targetState) {
          issues.push(`Symlink ${symlink.filePath} points to missing target ${symlink.targetPath}`);
        }
      }
    }

    logger.debug(logs.registry.debug.validationComplete(), issues.length, repaired.length);

    return {
      valid: issues.length === 0,
      issues,
      repaired,
    };
  }

  async getStats(): Promise<{
    totalOperations: number;
    totalFiles: number;
    totalTools: number;
    oldestOperation: number;
    newestOperation: number;
  }> {
    const totalOperations = this.db.prepare('SELECT COUNT(*) as count FROM file_operations').get() as { count: number };
    const totalFiles = this.db.prepare('SELECT COUNT(DISTINCT file_path) as count FROM file_operations').get() as {
      count: number;
    };
    const totalTools = this.db.prepare('SELECT COUNT(DISTINCT tool_name) as count FROM file_operations').get() as {
      count: number;
    };
    const timeRange = this.db
      .prepare('SELECT MIN(created_at) as oldest, MAX(created_at) as newest FROM file_operations')
      .get() as { oldest: number; newest: number };

    return {
      totalOperations: totalOperations.count,
      totalFiles: totalFiles.count,
      totalTools: totalTools.count,
      oldestOperation: timeRange.oldest || 0,
      newestOperation: timeRange.newest || 0,
    };
  }

  async close(): Promise<void> {
    this.db.close();
    this.logger.debug(logs.registry.debug.registryClosed());
  }

  private initializeSchema(): void {
    const logger = this.logger.getSubLogger({ name: 'initializeSchema' });

    // Create the main operations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool_name TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        target_path TEXT,
        file_type TEXT NOT NULL,
        metadata TEXT,
        size_bytes INTEGER,
        permissions TEXT,
        created_at INTEGER NOT NULL,
        operation_id TEXT NOT NULL
      )
    `);

    // Create indices for common queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tool_name ON file_operations(tool_name);
      CREATE INDEX IF NOT EXISTS idx_file_path ON file_operations(file_path);
      CREATE INDEX IF NOT EXISTS idx_operation_type ON file_operations(operation_type);
      CREATE INDEX IF NOT EXISTS idx_created_at ON file_operations(created_at);
      CREATE INDEX IF NOT EXISTS idx_operation_id ON file_operations(operation_id);
    `);

    logger.debug(logs.registry.debug.schemaInitialized());
  }
}
