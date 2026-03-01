import fs from 'node:fs';
import path from 'node:path';

import { BuildError } from '../handleBuildError';

function findFilesByNameRecursive(startDir: string, fileName: string): string[] {
  const stack: string[] = [startDir];
  const matches: string[] = [];

  while (stack.length > 0) {
    const dirPath: string | undefined = stack.pop();
    if (!dirPath) {
      continue;
    }

    const entries: fs.Dirent[] = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath: string = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }

      if (entry.isFile() && entry.name === fileName) {
        matches.push(entryPath);
      }
    }
  }

  matches.sort((a, b) => a.localeCompare(b));
  return matches;
}

/**
 * Locates the generated schema-exports.d.ts file.
 * Checks the temp build dir first, then falls back to the source tree
 * (tsgo may emit .d.ts files in-place instead of respecting outDir).
 */
export function resolveSchemaExportsDtsPath(tempSchemasBuildDir: string): string {
  const directPath: string = path.join(tempSchemasBuildDir, 'schema-exports.d.ts');
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  // tsc emits with full path structure under outDir
  const nestedWithPackagesPath: string = path.join(
    tempSchemasBuildDir,
    'packages',
    'cli',
    'src',
    'schema-exports.d.ts',
  );
  if (fs.existsSync(nestedWithPackagesPath)) {
    return nestedWithPackagesPath;
  }

  // collectInPlaceDtsFiles copies with paths relative to packages/
  const nestedPath: string = path.join(tempSchemasBuildDir, 'cli', 'src', 'schema-exports.d.ts');
  if (fs.existsSync(nestedPath)) {
    return nestedPath;
  }

  const matches: string[] = findFilesByNameRecursive(tempSchemasBuildDir, 'schema-exports.d.ts');

  if (matches.length === 1) {
    const match: string | undefined = matches[0];
    if (!match) {
      throw new BuildError('schema-exports.d.ts was found but could not be read');
    }
    return match;
  }

  if (matches.length === 0) {
    throw new BuildError('schema-exports.d.ts was not generated');
  }

  throw new BuildError(`Multiple schema-exports.d.ts files found: ${matches.join(', ')}`);
}
