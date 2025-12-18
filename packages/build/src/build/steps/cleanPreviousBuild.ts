/** biome-ignore-all lint/suspicious/noConsole: build script */

import fs from 'node:fs';

import type { IBuildContext } from '../types';

/**
 * Removes the previous build output directory to ensure a clean build.
 */
export async function cleanPreviousBuild(context: IBuildContext): Promise<void> {
  if (fs.existsSync(context.paths.outputDir)) {
    console.log('🧹 Cleaning previous build...');
    fs.rmSync(context.paths.outputDir, { recursive: true, force: true });
  }
}
