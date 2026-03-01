import fs from 'node:fs';
import path from 'node:path';

import type { IBuildContext } from '../types';

/**
 * Removes temporary schema-build directories created inside the output folder.
 */
export function cleanupSchemaBuildArtifacts(context: IBuildContext): void {
  fs.rmSync(context.paths.outputPackagesDir, { recursive: true, force: true });
  fs.rmSync(path.join(context.paths.outputDir, 'node_modules'), { recursive: true, force: true });
}
