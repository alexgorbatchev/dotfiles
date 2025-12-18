import fs from 'node:fs';
import path from 'node:path';

import type { IBuildContext, ITypeTestFile } from '../types';

/**
 * Discovers type test files across workspace packages.
 */
export function getTypeTestFiles(context: IBuildContext): ITypeTestFile[] {
  const packages: fs.Dirent[] = fs.readdirSync(context.paths.packagesDir, { withFileTypes: true });
  const files: ITypeTestFile[] = [];

  for (const entry of packages) {
    if (!entry.isDirectory()) {
      continue;
    }

    const packageName: string = entry.name;
    const typeTestsDir: string = path.join(context.paths.packagesDir, packageName, context.constants.typeTestsDirName);

    if (!fs.existsSync(typeTestsDir)) {
      continue;
    }

    const typeTestEntries: fs.Dirent[] = fs.readdirSync(typeTestsDir, { withFileTypes: true });

    for (const typeTestEntry of typeTestEntries) {
      if (!typeTestEntry.isFile()) {
        continue;
      }

      if (!typeTestEntry.name.endsWith(context.constants.tsdTestFileExtension)) {
        continue;
      }

      const sourcePath: string = path.join(typeTestsDir, typeTestEntry.name);
      const file: ITypeTestFile = {
        packageName,
        fileName: typeTestEntry.name,
        sourcePath,
      };

      files.push(file);
    }
  }

  return files;
}
