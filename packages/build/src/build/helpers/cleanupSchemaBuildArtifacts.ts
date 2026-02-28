import fs from 'node:fs';
import path from 'node:path';

import type { IBuildContext } from '../types';

/**
 * Removes .d.ts files emitted in-place by tsgo alongside source files.
 */
function removeInPlaceDtsFiles(packagesDir: string): void {
  function walkDir(dir: string): void {
    const entries: fs.Dirent[] = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath: string = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === 'type-tests') continue;
        walkDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.d.ts')) {
        // Only remove if a matching .ts source file exists
        const tsPath: string = fullPath.replace(/\.d\.ts$/, '.ts');
        if (fs.existsSync(tsPath)) {
          fs.unlinkSync(fullPath);
        }
      }
    }
  }

  walkDir(packagesDir);
}

/**
 * Removes temporary schema-build directories created inside the output folder,
 * and cleans up any .d.ts files emitted in-place by tsgo.
 */
export function cleanupSchemaBuildArtifacts(context: IBuildContext): void {
  fs.rmSync(context.paths.outputPackagesDir, { recursive: true, force: true });
  fs.rmSync(path.join(context.paths.outputDir, 'node_modules'), { recursive: true, force: true });
  removeInPlaceDtsFiles(context.paths.packagesDir);
}
