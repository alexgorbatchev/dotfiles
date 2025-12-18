import fs from 'node:fs';
import path from 'node:path';

import type { IBuildContext } from '../types';
import { getTypeTestFiles } from './getTypeTestFiles';

/**
 * Copies per-package type test files into a single destination directory.
 */
export function copyTypeTestFiles(context: IBuildContext, destinationDir: string): void {
  const files = getTypeTestFiles(context);

  for (const file of files) {
    const packageDestinationDir: string = path.join(destinationDir, file.packageName);
    fs.mkdirSync(packageDestinationDir, { recursive: true });
    const destinationPath: string = path.join(packageDestinationDir, file.fileName);
    fs.copyFileSync(file.sourcePath, destinationPath);
  }
}
