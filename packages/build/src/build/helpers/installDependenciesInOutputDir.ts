/** biome-ignore-all lint/suspicious/noConsole: build script */

import { $ } from 'dax-sh';
import { BuildError } from '../handleBuildError';
import type { IBuildContext } from '../types';
import { ensureBunCacheDirectory } from './ensureBunCacheDirectory';

/**
 * Installs dependencies within the output directory for schema bundling and validation.
 *
 * Notes:
 * - This install relies on the temporary workspace files written by `createTempSchemasPackage()`.
 * - Some schema generation steps can still succeed without this install if the root workspace
 *   environment already satisfies type resolution and the bundling tooling skips checks.
 */
export async function installDependenciesInOutputDir(context: IBuildContext): Promise<void> {
  console.log('📥 Installing dependencies in output directory...');
  ensureBunCacheDirectory(context);

  try {
    const installResult = await $`cd ${context.paths.outputDir} && bun install`.noThrow();

    if (installResult.code !== 0) {
      throw new BuildError('Temporary dependency installation failed');
    }
  } catch (error) {
    throw new BuildError('Temporary dependency installation failed', error);
  }
}
