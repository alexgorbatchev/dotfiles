import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { TsLogger } from '@modules/logger';
import { registryDatabaseLogMessages } from './log-messages';

/**
 * Registry database connection for the dotfiles generator.
 * Manages the shared SQLite database used by file registry and tool installation registry.
 */
export class RegistryDatabase {
  private db: Database;
  private logger: TsLogger;

  constructor(parentLogger: TsLogger, registryDbPath: string) {
    this.logger = parentLogger.getSubLogger({ name: 'RegistryDatabase' });
    const dbDir = path.dirname(registryDbPath);
    mkdirSync(dbDir, { recursive: true });
    this.db = new Database(registryDbPath);
  this.logger.debug(registryDatabaseLogMessages.initialized(), 'shared connection');
  }

  /**
   * Get the database connection
   */
  getConnection(): Database {
    return this.db;
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}
