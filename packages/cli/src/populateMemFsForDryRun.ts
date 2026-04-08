import type { IFileSystem } from "@dotfiles/file-system";
import type { TsLogger } from "@dotfiles/logger";
import { contractHomePath } from "@dotfiles/utils";
import path from "node:path";
import { messages } from "./log-messages";

interface PopulateMemFsParams {
  /** Source filesystem to read from (typically NodeFileSystem) */
  sourceFs: IFileSystem;
  /** Target filesystem to write to (typically MemFileSystem) */
  targetFs: IFileSystem;
  /** Directory containing tool configurations */
  toolConfigsDir: string;
  /** Home directory for path contraction in logs */
  homeDir: string;
}

/**
 * Populates an in-memory filesystem with all files from a tool configs directory.
 *
 * Used in dry-run mode to ensure the in-memory filesystem contains all files
 * that tools may reference, including configuration files, keys, and other
 * supporting assets alongside .tool.ts files.
 */
export async function populateMemFsForDryRun(parentLogger: TsLogger, params: PopulateMemFsParams): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: "populateMemFsForDryRun" });
  const { sourceFs, targetFs, toolConfigsDir, homeDir } = params;

  logger.trace(messages.toolConfigsForDryRun());

  if (!(await sourceFs.exists(toolConfigsDir))) {
    logger.warn(messages.fsItemNotFound("Tool configs directory", toolConfigsDir));
    return;
  }

  const filePaths = await collectFilePaths(logger, sourceFs, toolConfigsDir);
  logger.trace(messages.toolConfigsLoaded(toolConfigsDir, filePaths.length));

  for (const filePath of filePaths) {
    await copyFile(logger, sourceFs, targetFs, filePath, homeDir);
  }
}

/**
 * Recursively collects all file paths from a directory tree.
 */
async function collectFilePaths(logger: TsLogger, fs: IFileSystem, dirPath: string): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await fs.readdir(dirPath);

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry);

      try {
        const stat = await fs.stat(entryPath);

        if (stat.isDirectory()) {
          const subResults = await collectFilePaths(logger, fs, entryPath);
          results.push(...subResults);
        } else {
          results.push(entryPath);
        }
      } catch (error) {
        logger.debug(messages.fsReadFailed(entryPath), error);
      }
    }
  } catch (error) {
    logger.debug(messages.fsReadFailed(dirPath), error);
  }

  return results;
}

/**
 * Copies a file from source filesystem to target filesystem.
 */
async function copyFile(
  logger: TsLogger,
  sourceFs: IFileSystem,
  targetFs: IFileSystem,
  filePath: string,
  homeDir: string,
): Promise<void> {
  try {
    const content = await sourceFs.readFile(filePath, "utf8");
    await targetFs.ensureDir(path.dirname(filePath));
    await targetFs.writeFile(filePath, content);
    logger.trace(messages.fsWrite("memfs", contractHomePath(homeDir, filePath)));
  } catch (error) {
    logger.error(messages.fsReadFailed(filePath), error);
  }
}
