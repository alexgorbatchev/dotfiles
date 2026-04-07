import fs from 'node:fs';

import type { IBuildContext } from '../types';

/**
 * Deletes temporary build artifacts and generated intermediate files.
 */
export async function cleanupTempFiles(context: IBuildContext): Promise<void> {
  const filesToCleanup: string[] = [
    context.paths.tempSchemasBuildDir,
    context.paths.buildTsconfigPath,
    context.paths.outputBunfigPath,
    context.paths.outputBunLockPath,
    context.paths.schemaCheckTsconfigPath,
  ];

  for (const filePath of filesToCleanup) {
    fs.rmSync(filePath, { recursive: true, force: true });
  }
}
