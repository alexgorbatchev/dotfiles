import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
