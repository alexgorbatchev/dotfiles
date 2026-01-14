import fs from 'node:fs';
import path from 'node:path';
import type { IBuildContext } from '../types';
import { copyDirectoryRecursive } from './copyDirectoryRecursive';

/**
 * Copies workspace packages into the output directory for schema bundling and tests.
 */
export function copyPackagesToOutputDir(context: IBuildContext): void {
  console.log('📦 Copying packages to build directory...');
  fs.mkdirSync(context.paths.outputPackagesDir, { recursive: true });

  const packageEntries: fs.Dirent[] = fs.readdirSync(context.paths.packagesDir, { withFileTypes: true });

  for (const entry of packageEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const sourcePackagePath: string = path.join(context.paths.packagesDir, entry.name);
    const destPackagePath: string = path.join(context.paths.outputPackagesDir, entry.name);

    copyDirectoryRecursive(sourcePackagePath, destPackagePath, context.constants.excludedPackageCopyDirs);
  }
}
