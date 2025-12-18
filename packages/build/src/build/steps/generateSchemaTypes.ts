/** biome-ignore-all lint/suspicious/noConsole: build script */

import { BuildError } from '../handleBuildError';
import { buildSchemaTypes } from '../helpers/buildSchemaTypes';
import { checkProjectConfigTypeSignature } from '../helpers/checkProjectConfigTypeSignature';
import { cleanupSchemaBuildArtifacts } from '../helpers/cleanupSchemaBuildArtifacts';
import type { IBuildContext, IDependencyVersions } from '../types';

/**
 * Generates bundled schema and config declaration files used by the published package.
 */
export async function generateSchemaTypes(
  context: IBuildContext,
  dependencyVersions: IDependencyVersions
): Promise<void> {
  console.log('📝 Building @dotfiles/core config types...');

  try {
    await buildSchemaTypes(context, dependencyVersions);
    checkProjectConfigTypeSignature(context);
    cleanupSchemaBuildArtifacts(context);
  } catch (error) {
    throw new BuildError('Schema type generation failed', error);
  }
}
