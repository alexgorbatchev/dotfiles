import type { Database } from 'bun:sqlite';
import type { TsLogger } from '@modules/logger';
import type { IToolInstallationRegistry } from './IToolInstallationRegistry';
import { toolInstallationRegistryLogMessages } from './log-messages';
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
}

export class SqliteToolInstallationRegistry implements IToolInstallationRegistry {
  private db: Database;
  private logger: TsLogger;

  constructor(parentLogger: TsLogger, db: Database) {
    this.logger = parentLogger.getSubLogger({ name: 'SqliteToolInstallationRegistry' });
    this.db = db;
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    this.logger.debug(toolInstallationRegistryLogMessages.schemaInitialized());
    this.db.exec(`
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
        UNIQUE(tool_name)
      );
    `);
  }

  async recordToolInstallation(installation: ToolInstallationInput): Promise<void> {
    this.logger.debug(
      toolInstallationRegistryLogMessages.operationRecorded(),
      'record',
      installation.toolName,
      installation.version
    );
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tool_installations 
      (tool_name, version, install_path, timestamp, installed_at, binary_paths, download_url, asset_name, configured_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      installation.configuredVersion || null
    );
  }

  async getToolInstallation(toolName: string): Promise<ToolInstallation | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM tool_installations WHERE tool_name = ?
    `);

    const row = stmt.get(toolName) as ToolInstallationRow | undefined;
    if (!row) return null;

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
    };
  }

  async getAllToolInstallations(): Promise<ToolInstallation[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM tool_installations ORDER BY tool_name
    `);

    const rows = stmt.all() as ToolInstallationRow[];
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
    }));
  }

  async updateToolInstallation(toolName: string, updates: Partial<ToolInstallation>): Promise<void> {
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

    if (fields.length === 0) return;

    values.push(toolName);
    const stmt = this.db.prepare(`
      UPDATE tool_installations SET ${fields.join(', ')} WHERE tool_name = ?
    `);

    stmt.run(...values);
  }

  async removeToolInstallation(toolName: string): Promise<void> {
    const stmt = this.db.prepare(`
      DELETE FROM tool_installations WHERE tool_name = ?
    `);

    stmt.run(toolName);
  }

  async isToolInstalled(toolName: string, version?: string): Promise<boolean> {
    if (version) {
      const stmt = this.db.prepare(`
        SELECT 1 FROM tool_installations WHERE tool_name = ? AND version = ?
      `);
      const result = stmt.get(toolName, version);
      return result !== null;
    } else {
      const stmt = this.db.prepare(`
        SELECT 1 FROM tool_installations WHERE tool_name = ?
      `);
      const result = stmt.get(toolName);
      return result !== null;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
