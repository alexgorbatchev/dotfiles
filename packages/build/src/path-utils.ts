import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Converts a module URL to a directory path.
 *
 * @param metaUrl - The `import.meta.url` value from an ES module.
 * @returns The directory path containing the module.
 */
export function getDirname(metaUrl: string): string {
  const __filename = fileURLToPath(metaUrl);
  return path.dirname(__filename);
}

/**
 * Locates the repository root by searching for a `package.json` file with workspaces.
 *
 * Walks up the directory tree from the current module's location until it finds
 * a `package.json` file that contains a `workspaces` field, indicating the monorepo root.
 *
 * @returns The absolute path to the repository root directory.
 * @throws {Error} If no workspace root is found.
 */
export function getRepoRoot(): string {
  let currentDir = path.dirname(fileURLToPath(import.meta.url));

  // Walk up the directory tree until we find package.json with workspaces
  while (currentDir !== path.parse(currentDir).root) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (packageJson.workspaces) {
        return currentDir;
      }
    }
    currentDir = path.dirname(currentDir);
  }

  throw new Error('Could not find repository root (no package.json with workspaces found)');
}

/**
 * Changes the current working directory to the repository root.
 *
 * Uses {@link getRepoRoot} to locate the workspace root and then changes
 * `process.cwd()` to that directory.
 *
 * @throws {Error} If no workspace root is found.
 */
export function cdToRepoRoot(): void {
  const repoRoot = getRepoRoot();
  process.chdir(repoRoot);
}

/**
 * Prints the contents of a directory to the console with formatting.
 *
 * Displays files and directories with appropriate icons (📁 for directories, 📄 for files).
 * If the directory doesn't exist or is empty, appropriate messages are shown.
 *
 * @param directoryPath - The path to the directory to list.
 * @param title - Optional title to display before the listing. Defaults to 'Directory contents'.
 */
export function printDirectoryContents(directoryPath: string, title: string = 'Directory contents'): void {
  console.log(`📋 ${title}:`);

  if (!fs.existsSync(directoryPath)) {
    console.log('   (Directory does not exist)');
    return;
  }

  const files = fs.readdirSync(directoryPath, { withFileTypes: true });

  if (files.length === 0) {
    console.log('   (Empty directory)');
    return;
  }

  files.sort((a, b) => a.name.localeCompare(b.name));

  for (const file of files) {
    const icon = file.isDirectory() ? '📁' : '📄';
    console.log(`   ${icon} ${file.name}`);
  }
}
