import type { TsLogger } from "@dotfiles/logger";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { messages } from "./log-messages";

/**
 * Manages the shared SQLite database connection for the dotfiles project.
 *
 * This class is responsible for initializing and providing access to a centralized
 * SQLite database. It ensures that different parts of the application, such as the
 * file registry and tool installation registry, can share a single database connection.
 *
 * @param parentLogger - The parent logger instance for creating a sub-logger.
 * @param registryDbPath - The file system path to the SQLite database file.
 */
export class RegistryDatabase {
  private db: Database;
  private logger: TsLogger;

  constructor(parentLogger: TsLogger, registryDbPath: string) {
    this.logger = parentLogger.getSubLogger({ name: "RegistryDatabase" });
    const dbDir = path.dirname(registryDbPath);
    mkdirSync(dbDir, { recursive: true });
    this.db = new Database(registryDbPath);
    this.configureConnectionPragmas();
    this.logger.debug(messages.initialized(), "shared connection");
  }

  private configureConnectionPragmas(): void {
    // Improve multi-process write behavior for shim usage tracking + foreground commands.
    // busy_timeout prevents immediate SQLITE_BUSY failures when another process briefly holds a lock.
    // WAL allows concurrent readers with a single writer and reduces lock contention.
    // synchronous=NORMAL is a practical durability/performance balance for this metadata DB.
    try {
      this.db.run("PRAGMA busy_timeout = 5000;");
      this.db.run("PRAGMA journal_mode = WAL;");
      this.db.run("PRAGMA synchronous = NORMAL;");
    } catch (error) {
      this.logger.warn(messages.sqlitePragmaConfigFailed(), error);
    }
  }

  /**
   * Retrieves the active SQLite database connection.
   *
   * @returns The `Database` instance from `bun:sqlite`.
   */
  getConnection(): Database {
    return this.db;
  }

  /**
   * Closes the database connection.
   *
   * This method should be called during application shutdown to ensure a graceful
   * termination of the database connection.
   */
  close(): void {
    this.db.close();
  }
}
