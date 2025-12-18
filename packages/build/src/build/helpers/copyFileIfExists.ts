import fs from 'node:fs';

/**
 * Copies a file if it exists.
 */
export function copyFileIfExists(sourcePath: string, destinationPath: string): void {
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destinationPath);
  }
}
