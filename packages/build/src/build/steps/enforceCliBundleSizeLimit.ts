import fs from 'node:fs';
import { BuildError } from '../handleBuildError';
import type { IBuildContext } from '../types';

/**
 * Ensures the built CLI bundle stays under the configured size budget.
 */
export function enforceCliBundleSizeLimit(context: IBuildContext): void {
  const cliStats = fs.statSync(context.paths.cliOutputFile);
  if (!cliStats.isFile()) {
    throw new BuildError('cli.js output is missing');
  }

  if (cliStats.size <= context.constants.maxCliBundleSizeBytes) {
    return;
  }

  const sizeKb: number = Math.ceil(cliStats.size / 1024);
  throw new BuildError(`cli.js file is too large (${sizeKb} kb), external dependencies are most likely being bundled`);
}
