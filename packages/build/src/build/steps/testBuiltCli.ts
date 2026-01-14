import { $ } from 'dax-sh';
import { BuildError } from '../handleBuildError';
import type { IBuildContext } from '../types';

/**
 * Smoke-tests the built CLI binary by executing it and validating it can report a version.
 */
export async function testBuiltCli(context: IBuildContext): Promise<void> {
  console.log('🧪 Testing built CLI...');

  const testResult = await $`bun ${context.paths.cliOutputFile} --version`.quiet().noThrow();

  if (testResult.code === 0) {
    console.log(`✅ CLI test passed - version: ${testResult.stdout.toString().trim()}`);
    return;
  }

  console.error(`❌ CLI test failed with exit code: ${testResult.code}`);
  console.error(`Error output: ${testResult.stderr.toString()}`);
  throw new BuildError('CLI test failed');
}
