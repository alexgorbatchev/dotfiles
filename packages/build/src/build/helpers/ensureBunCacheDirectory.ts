import fs from 'node:fs';

import type { IBuildContext } from '../types';

/**
 * Ensures the Bun cache directories exist so installs can proceed.
 */
export function ensureBunCacheDirectory(context: IBuildContext): void {
  fs.mkdirSync(context.paths.rootNodeModulesPath, { recursive: true });
  fs.mkdirSync(context.paths.rootBunCachePath, { recursive: true });
}
