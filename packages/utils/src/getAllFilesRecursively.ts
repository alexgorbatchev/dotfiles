import path from 'node:path';
import type { IFileSystem } from '@dotfiles/file-system';

/**
 * Recursively collects all file paths in a directory.
 *
 * @param fs - The file system interface to use
 * @param dirPath - The directory to scan
 * @param baseDir - The base directory for calculating relative paths (defaults to dirPath)
 * @returns Array of file paths (absolute if baseDir is not provided, relative to baseDir otherwise)
 */
export async function getAllFilesRecursively(
  fs: IFileSystem,
  dirPath: string,
  baseDir?: string
): Promise<string[]> {
  const files: string[] = [];
  const base = baseDir ?? dirPath;
  const entries = await fs.readdir(dirPath);

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    const stats = await fs.stat(fullPath);

    if (stats.isDirectory()) {
      const subFiles = await getAllFilesRecursively(fs, fullPath, base);
      files.push(...subFiles);
    } else {
      // Return absolute paths if no baseDir, relative paths otherwise
      const resultPath = baseDir ? path.relative(base, fullPath) : fullPath;
      files.push(resultPath);
    }
  }

  return files;
}
