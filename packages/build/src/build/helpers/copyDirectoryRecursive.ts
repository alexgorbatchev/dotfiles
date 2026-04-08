import fs from "node:fs";
import path from "node:path";

/**
 * Recursively copies a directory tree, optionally excluding specific directory names.
 */
export function copyDirectoryRecursive(sourcePath: string, destinationPath: string, excludeDirs: string[]): void {
  fs.mkdirSync(destinationPath, { recursive: true });

  const entries: fs.Dirent[] = fs.readdirSync(sourcePath, { withFileTypes: true });

  for (const entry of entries) {
    const sourceEntryPath: string = path.join(sourcePath, entry.name);
    const destEntryPath: string = path.join(destinationPath, entry.name);

    if (entry.isDirectory()) {
      if (excludeDirs.includes(entry.name)) {
        continue;
      }
      copyDirectoryRecursive(sourceEntryPath, destEntryPath, excludeDirs);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourceEntryPath, destEntryPath);
    } else if (entry.isSymbolicLink()) {
      const linkTarget: string = fs.readlinkSync(sourceEntryPath);
      fs.symlinkSync(linkTarget, destEntryPath);
    }
  }
}
