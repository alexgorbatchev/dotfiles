import { $ } from 'dax-sh';
import { BuildError } from '../handleBuildError';
import { ensureBunCacheDirectory, throwIfCertificateError } from '../helpers';
import type { IBuildContext } from '../types';

/**
 * Installs workspace dependencies so the build runs with a consistent node_modules state.
 */
export async function ensureWorkspaceDependencies(context: IBuildContext): Promise<void> {
  ensureBunCacheDirectory(context);
  console.log('🔄 Ensuring workspace dependencies...');

  try {
    const installResult = await $`bun install`.quiet().noThrow();

    throwIfCertificateError(installResult.stderr.toString());

    if (installResult.code !== 0) {
      throw new BuildError('Workspace dependency installation failed');
    }
  } catch (error) {
    if (error instanceof BuildError) {
      throw error;
    }
    throw new BuildError('Workspace dependency installation failed', error);
  }
}
