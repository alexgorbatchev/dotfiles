import type { IFileSystem } from "@dotfiles/file-system";
import path from "node:path";

/**
 * Recursively collects all file paths in a directory.
 *
 * @param fs - The file system interface to use
 * @param dirPath - The directory to scan
 * @param baseDir - The base directory for calculating relative paths. If provided, returns relative paths.
 *                  If not provided (undefined), returns absolute paths.
 * @returns Array of file paths (absolute if baseDir is not provided, relative to baseDir otherwise)
 */
export async function getAllFilesRecursively(fs: IFileSystem, dirPath: string, baseDir?: string): Promise<string[]> {
  const files: string[] = [];
  // Track whether caller wants relative paths (baseDir was explicitly provided)
  const wantsRelativePaths = baseDir !== undefined;
  const base = baseDir ?? dirPath;
  const entries = await fs.readdir(dirPath);

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    const stats = await fs.stat(fullPath);

    if (stats.isDirectory()) {
      // Always pass base to recursive calls, but preserve the "wants relative" intent
      const subFiles = await getAllFilesRecursively(fs, fullPath, wantsRelativePaths ? base : undefined);
      files.push(...subFiles);
    } else {
      // Return relative paths only if caller explicitly requested them
      const resultPath = wantsRelativePaths ? path.relative(base, fullPath) : fullPath;
      files.push(resultPath);
    }
  }

  return files;
}
