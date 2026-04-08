import type { TsLogger } from "@dotfiles/logger";
import type { Database } from "bun:sqlite";
import type { IToolInstallationRegistry } from "./IToolInstallationRegistry";
import { messages } from "./log-messages";
import type { IToolInstallationDetails, IToolInstallationRecord, IToolUsageRecord } from "./types";

interface IToolInstallationRow {
  id: number;
  tool_name: string;
  version: string;
  install_path: string;
  timestamp: string;
  installed_at: number;
  binary_paths: string;
  download_url: string | null;
  asset_name: string | null;
  configured_version: string | null;
  original_tag: string | null;
  install_method: string | null;
}

interface IToolUsageRow {
  tool_name: string;
  binary_name: string;
  usage_count: number;
  last_used_at: number;
}

type ToolInstallationUpdateValue = string | number | null;

interface IToolInstallationColumn {
  name: string;
}

/**
 * SQLite-based implementation of the tool installation registry.
 *
 * This class manages a persistent database of installed tools, tracking metadata such as
 * versions, installation paths, binary locations, and download sources. Each tool can have
 * only one installation record at a time, enforced by a unique constraint on the tool name.
 *
 * The registry serves several critical purposes:
 * - **Version tracking**: Records the actual installed version for update detection
 * - **Path management**: Stores installation paths and binary locations for cleanup
 * - **Source tracking**: Maintains download URLs and asset names for reproducibility
 * - **Installation history**: Records timestamps for tracking when tools were installed
 *
 * When a tool is reinstalled or upgraded, the previous record is automatically replaced
 * using SQLite's INSERT OR REPLACE functionality, ensuring the registry always reflects
 * the current state of installed tools.
 */
export class ToolInstallationRegistry implements IToolInstallationRegistry {
  private db: Database;
  private logger: TsLogger;

  constructor(parentLogger: TsLogger, db: Database) {
    this.logger = parentLogger.getSubLogger({ name: "ToolInstallationRegistry" });
    this.db = db;
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    const logger = this.logger.getSubLogger({ name: "initializeDatabase" });
    this.db.run(`
      CREATE TABLE IF NOT EXISTS tool_installations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool_name TEXT NOT NULL UNIQUE,
        version TEXT NOT NULL,
        install_path TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        installed_at INTEGER NOT NULL,
        binary_paths TEXT NOT NULL,
        download_url TEXT,
        asset_name TEXT,
        configured_version TEXT,
        original_tag TEXT,
        install_method TEXT,
        UNIQUE(tool_name)
      );
    `);

    // Migration: Add install_method column if it doesn't exist (for existing databases)
    this.migrateAddInstallMethod();

    this.db.run(`
      CREATE TABLE IF NOT EXISTS tool_usage (
        tool_name TEXT NOT NULL,
        binary_name TEXT NOT NULL,
        usage_count INTEGER NOT NULL DEFAULT 0,
        last_used_at INTEGER NOT NULL,
        PRIMARY KEY (tool_name, binary_name)
      );
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_tool_usage_tool_name ON tool_usage(tool_name);
    `);

    logger.debug(messages.databaseInitialized());
  }

  private migrateAddInstallMethod(): void {
    try {
      // Check if column exists by querying table info
      const columns = this.db.prepare("PRAGMA table_info(tool_installations)").all() as IToolInstallationColumn[];
      const hasInstallMethod = columns.some((col) => col.name === "install_method");
      if (!hasInstallMethod) {
        this.db.run("ALTER TABLE tool_installations ADD COLUMN install_method TEXT");
      }
    } catch {
      // Column might already exist, ignore errors
    }
  }

  async recordToolInstallation(installation: IToolInstallationDetails): Promise<void> {
    const logger = this.logger.getSubLogger({ name: "recordToolInstallation" });
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tool_installations 
      (tool_name, version, install_path, timestamp, installed_at, binary_paths, download_url, asset_name, configured_version, original_tag, install_method)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      installation.toolName,
      installation.version,
      installation.installPath,
      installation.timestamp,
      Date.now(),
      JSON.stringify(installation.binaryPaths),
      installation.downloadUrl || null,
      installation.assetName || null,
      installation.configuredVersion || null,
      installation.originalTag || null,
      installation.installMethod || null,
    );
    logger.debug(messages.toolInstallationRecorded(), installation.toolName, installation.version);
  }

  async getToolInstallation(toolName: string): Promise<IToolInstallationRecord | null> {
    const logger = this.logger.getSubLogger({ name: "getToolInstallation" });
    const stmt = this.db.prepare(`
      SELECT * FROM tool_installations WHERE tool_name = ?
    `);

    const row = stmt.get(toolName) as IToolInstallationRow | undefined;
    if (!row) {
      logger.debug(messages.toolInstallationNotFound(), toolName);
      return null;
    }

    return {
      id: row.id,
      toolName: row.tool_name,
      version: row.version,
      installPath: row.install_path,
      timestamp: row.timestamp,
      installedAt: new Date(row.installed_at),
      binaryPaths: JSON.parse(row.binary_paths),
      downloadUrl: row.download_url || undefined,
      assetName: row.asset_name || undefined,
      configuredVersion: row.configured_version || undefined,
      originalTag: row.original_tag || undefined,
      installMethod: row.install_method || undefined,
    };
  }

  async getAllToolInstallations(): Promise<IToolInstallationRecord[]> {
    const logger = this.logger.getSubLogger({ name: "getAllToolInstallations" });
    const stmt = this.db.prepare(`
      SELECT * FROM tool_installations ORDER BY tool_name
    `);

    const rows = stmt.all() as IToolInstallationRow[];
    logger.debug(messages.toolInstallationsRetrieved(), rows.length);
    return rows.map((row) => ({
      id: row.id,
      toolName: row.tool_name,
      version: row.version,
      installPath: row.install_path,
      timestamp: row.timestamp,
      installedAt: new Date(row.installed_at),
      binaryPaths: JSON.parse(row.binary_paths),
      downloadUrl: row.download_url || undefined,
      assetName: row.asset_name || undefined,
      configuredVersion: row.configured_version || undefined,
      originalTag: row.original_tag || undefined,
      installMethod: row.install_method || undefined,
    }));
  }

  async updateToolInstallation(toolName: string, updates: Partial<IToolInstallationRecord>): Promise<void> {
    const logger = this.logger.getSubLogger({ name: "updateToolInstallation" });
    const fields: string[] = [];
    const values: ToolInstallationUpdateValue[] = [];

    if (updates.version !== undefined) {
      fields.push("version = ?");
      values.push(updates.version);
    }
    if (updates.installPath !== undefined) {
      fields.push("install_path = ?");
      values.push(updates.installPath);
    }
    if (updates.timestamp !== undefined) {
      fields.push("timestamp = ?");
      values.push(updates.timestamp);
    }
    if (updates.binaryPaths !== undefined) {
      fields.push("binary_paths = ?");
      values.push(JSON.stringify(updates.binaryPaths));
    }
    if (updates.downloadUrl !== undefined) {
      fields.push("download_url = ?");
      values.push(updates.downloadUrl);
    }
    if (updates.assetName !== undefined) {
      fields.push("asset_name = ?");
      values.push(updates.assetName);
    }
    if (updates.configuredVersion !== undefined) {
      fields.push("configured_version = ?");
      values.push(updates.configuredVersion);
    }
    if (updates.originalTag !== undefined) {
      fields.push("original_tag = ?");
      values.push(updates.originalTag);
    }

    if (fields.length === 0) {
      logger.debug(messages.noUpdatesProvided(), toolName);
      return;
    }

    values.push(toolName);
    const stmt = this.db.prepare(`
      UPDATE tool_installations SET ${fields.join(", ")} WHERE tool_name = ?
    `);

    stmt.run(...values);
    logger.debug(messages.toolInstallationUpdated(), toolName);
  }

  async removeToolInstallation(toolName: string): Promise<void> {
    const logger = this.logger.getSubLogger({ name: "removeToolInstallation" });
    const stmt = this.db.prepare(`
      DELETE FROM tool_installations WHERE tool_name = ?
    `);

    stmt.run(toolName);
    logger.debug(messages.toolInstallationRemoved(), toolName);
  }

  async isToolInstalled(toolName: string, version?: string): Promise<boolean> {
    const logger = this.logger.getSubLogger({ name: "isToolInstalled" });
    if (version) {
      const stmt = this.db.prepare(`
        SELECT 1 FROM tool_installations WHERE tool_name = ? AND version = ?
      `);
      const result = stmt.get(toolName, version);
      const isInstalled: boolean = result !== null;
      logger.debug(messages.toolInstallationCheckCompleted(), toolName, version, isInstalled);
      return isInstalled;
    } else {
      const stmt = this.db.prepare(`
        SELECT 1 FROM tool_installations WHERE tool_name = ?
      `);
      const result = stmt.get(toolName);
      const isInstalled: boolean = result !== null;
      logger.debug(messages.toolInstallationCheckCompleted(), toolName, "any", isInstalled);
      return isInstalled;
    }
  }

  async recordToolUsage(toolName: string, binaryName: string): Promise<void> {
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO tool_usage (tool_name, binary_name, usage_count, last_used_at)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(tool_name, binary_name)
      DO UPDATE SET
        usage_count = usage_count + 1,
        last_used_at = excluded.last_used_at
    `);

    stmt.run(toolName, binaryName, now);
  }

  async getToolUsage(toolName: string, binaryName: string): Promise<IToolUsageRecord | null> {
    const stmt = this.db.prepare(`
      SELECT tool_name, binary_name, usage_count, last_used_at
      FROM tool_usage
      WHERE tool_name = ? AND binary_name = ?
    `);

    const row = stmt.get(toolName, binaryName) as IToolUsageRow | undefined;
    if (!row) {
      return null;
    }

    return {
      toolName: row.tool_name,
      binaryName: row.binary_name,
      usageCount: row.usage_count,
      lastUsedAt: new Date(row.last_used_at),
    };
  }

  async close(): Promise<void> {
    const logger = this.logger.getSubLogger({ name: "close" });
    this.db.close();
    logger.debug(messages.databaseClosed());
  }
}
