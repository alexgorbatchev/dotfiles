import { $ } from 'dax-sh';
import { BuildError } from '../handleBuildError';
import { ensureBunCacheDirectory } from '../helpers';
import type { IBuildContext } from '../types';

/**
 * Installs workspace dependencies so the build runs with a consistent node_modules state.
 */
export async function ensureWorkspaceDependencies(context: IBuildContext): Promise<void> {
  ensureBunCacheDirectory(context);
  console.log('🔄 Ensuring workspace dependencies...');

  try {
    await $`bun install`;
  } catch (error) {
    throw new BuildError('Workspace dependency installation failed', error);
  }
}
