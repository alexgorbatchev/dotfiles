/** biome-ignore-all lint/suspicious/noConsole: build script */

import fs from 'node:fs';

import { copyDirectoryRecursive } from '../helpers/copyDirectoryRecursive';
import type { IBuildContext } from '../types';

/**
 * Copies documentation into the build output so it can be shipped with the CLI.
 */
export function copyDocs(context: IBuildContext): void {
  console.log('📚 Copying docs to build directory...');

  if (fs.existsSync(context.paths.docsDir)) {
    copyDirectoryRecursive(context.paths.docsDir, context.paths.outputDocsDir, []);
  }
}
