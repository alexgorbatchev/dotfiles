import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import path from 'node:path';
import { messages } from './log-messages';

/**
 * Collects all file paths from a directory tree for loading into MemFileSystem.
 *
 * Used in dry-run mode to ensure the in-memory filesystem contains all files
 * that tools may reference, including configuration files, keys, and other
 * supporting assets alongside .tool.ts files.
 */
export async function populateMemFsForDryRun(
  fs: IFileSystem,
  dirPath: string,
  logger: TsLogger,
): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await fs.readdir(dirPath);

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry);

      try {
        const stat = await fs.stat(entryPath);

        if (stat.isDirectory()) {
          const subResults = await populateMemFsForDryRun(fs, entryPath, logger);
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
