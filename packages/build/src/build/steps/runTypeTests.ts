import { BuildError } from '../handleBuildError';
import { shell } from '../helpers';
import { setupTsdTestsProject } from '../helpers/setupTsdTestsProject';
import type { IBuildContext } from '../types';

/**
 * Runs type-level validation of the generated declarations using tsd.
 */
export async function runTypeTests(context: IBuildContext): Promise<void> {
  console.log('🔍 Running tsd type tests...');

  try {
    await setupTsdTestsProject(context);

    const tsdResult = await shell`bun x tsd --typings ./index.d.ts --files './**/*.test-d.ts'`
      .noThrow()
      .cwd(context.paths.tsdTestsDir);

    if (tsdResult.code !== 0) {
      throw new BuildError('Schema type validation failed');
    }

    console.log('✅ tsd type tests passed');
  } catch (error) {
    throw new BuildError('Schema type validation failed', error);
  }

  console.log('✅ @dotfiles/core config types validated with tsd');
}
