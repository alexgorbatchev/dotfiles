import type { Database } from 'bun:sqlite';
import type { TsLogger } from '@dotfiles/logger';
import type { IToolInstallationRegistry } from './IToolInstallationRegistry';
import { messages } from './log-messages';
import type { ToolInstallation, ToolInstallationInput } from './types';

interface ToolInstallationRow {
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
}

export class ToolInstallationRegistry implements IToolInstallationRegistry {
  private db: Database;
  private logger: TsLogger;

  constructor(parentLogger: TsLogger, db: Database) {
    this.logger = parentLogger.getSubLogger({ name: 'ToolInstallationRegistry' });
    this.db = db;
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    const logger = this.logger.getSubLogger({ name: 'initializeDatabase' });
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
        UNIQUE(tool_name)
      );
    `);
    logger.debug(messages.databaseInitialized());
  }

  async recordToolInstallation(installation: ToolInstallationInput): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'recordToolInstallation' });
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tool_installations 
      (tool_name, version, install_path, timestamp, installed_at, binary_paths, download_url, asset_name, configured_version, original_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      installation.originalTag || null
    );
    logger.debug(messages.toolInstallationRecorded(), installation.toolName, installation.version);
  }

  async getToolInstallation(toolName: string): Promise<ToolInstallation | null> {
    const logger = this.logger.getSubLogger({ name: 'getToolInstallation' });
    const stmt = this.db.prepare(`
      SELECT * FROM tool_installations WHERE tool_name = ?
    `);

    const row = stmt.get(toolName) as ToolInstallationRow | undefined;
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
      installedAt: row.installed_at,
      binaryPaths: JSON.parse(row.binary_paths),
      downloadUrl: row.download_url || undefined,
      assetName: row.asset_name || undefined,
      configuredVersion: row.configured_version || undefined,
      originalTag: row.original_tag || undefined,
    };
  }

  async getAllToolInstallations(): Promise<ToolInstallation[]> {
    const logger = this.logger.getSubLogger({ name: 'getAllToolInstallations' });
    const stmt = this.db.prepare(`
      SELECT * FROM tool_installations ORDER BY tool_name
    `);

    const rows = stmt.all() as ToolInstallationRow[];
    logger.debug(messages.toolInstallationsRetrieved(), rows.length);
    return rows.map((row) => ({
      id: row.id,
      toolName: row.tool_name,
      version: row.version,
      installPath: row.install_path,
      timestamp: row.timestamp,
      installedAt: row.installed_at,
      binaryPaths: JSON.parse(row.binary_paths),
      downloadUrl: row.download_url || undefined,
      assetName: row.asset_name || undefined,
      configuredVersion: row.configured_version || undefined,
      originalTag: row.original_tag || undefined,
    }));
  }

  async updateToolInstallation(toolName: string, updates: Partial<ToolInstallation>): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'updateToolInstallation' });
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.version !== undefined) {
      fields.push('version = ?');
      values.push(updates.version);
    }
    if (updates.installPath !== undefined) {
      fields.push('install_path = ?');
      values.push(updates.installPath);
    }
    if (updates.timestamp !== undefined) {
      fields.push('timestamp = ?');
      values.push(updates.timestamp);
    }
    if (updates.binaryPaths !== undefined) {
      fields.push('binary_paths = ?');
      values.push(JSON.stringify(updates.binaryPaths));
    }
    if (updates.downloadUrl !== undefined) {
      fields.push('download_url = ?');
      values.push(updates.downloadUrl);
    }
    if (updates.assetName !== undefined) {
      fields.push('asset_name = ?');
      values.push(updates.assetName);
    }
    if (updates.configuredVersion !== undefined) {
      fields.push('configured_version = ?');
      values.push(updates.configuredVersion);
    }
    if (updates.originalTag !== undefined) {
      fields.push('original_tag = ?');
      values.push(updates.originalTag);
    }

    if (fields.length === 0) {
      logger.debug(messages.noUpdatesProvided(), toolName);
      return;
    }

    values.push(toolName);
    const stmt = this.db.prepare(`
      UPDATE tool_installations SET ${fields.join(', ')} WHERE tool_name = ?
    `);

    stmt.run(...values);
    logger.debug(messages.toolInstallationUpdated(), toolName);
  }

  async removeToolInstallation(toolName: string): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'removeToolInstallation' });
    const stmt = this.db.prepare(`
      DELETE FROM tool_installations WHERE tool_name = ?
    `);

    stmt.run(toolName);
    logger.debug(messages.toolInstallationRemoved(), toolName);
  }

  async isToolInstalled(toolName: string, version?: string): Promise<boolean> {
    const logger = this.logger.getSubLogger({ name: 'isToolInstalled' });
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
      logger.debug(messages.toolInstallationCheckCompleted(), toolName, 'any', isInstalled);
      return isInstalled;
    }
  }

  async close(): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'close' });
    this.db.close();
    logger.debug(messages.databaseClosed());
  }
}
