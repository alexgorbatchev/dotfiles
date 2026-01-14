import fs from 'node:fs';

import { getPackageJson } from '../../getPackageJson';
import type { IBuildContext, IDependencyVersions } from '../types';

/**
 * Writes the output package.json used for publishing/running the built CLI, including runtime dependency versions.
 */
export async function generateDistPackageJson(
  context: IBuildContext,
  dependencyVersions: IDependencyVersions,
  runtimeDependencies: Record<string, string>,
): Promise<void> {
  const dependencies: Record<string, string> = {
    ...runtimeDependencies,
    '@types/bun': dependencyVersions.bunTypes,
    '@types/node': dependencyVersions.nodeTypes,
  };

  const packageJson: Record<string, unknown> = {
    name: '@gitea/dotfiles',
    version: getPackageJson().version,
    type: 'module',
    bin: {
      dotfiles: './cli.js',
    },
    types: './schemas.d.ts',
    exports: {
      '.': {
        import: {
          types: './schemas.d.ts',
          default: './cli.js',
        },
      },
    },
    files: ['cli.js', 'cli.js.map', 'schemas.d.ts', 'tool-types.d.ts', 'docs'],
    dependencies,
  };

  fs.writeFileSync(context.paths.outputPackageJsonPath, JSON.stringify(packageJson, null, 2));
}
