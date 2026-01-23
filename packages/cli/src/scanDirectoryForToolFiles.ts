import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import path from 'node:path';
import { messages } from './log-messages';

/**
 * Recursively scans a directory tree for `.tool.ts` configuration files.
 *
 * Traverses the directory structure starting from the given path, collecting all files
 * that end with `.tool.ts`.
 */
export async function scanDirectoryForToolFiles(
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
          const subResults = await scanDirectoryForToolFiles(fs, entryPath, logger);
          results.push(...subResults);
        } else if (entry.endsWith('.tool.ts')) {
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
