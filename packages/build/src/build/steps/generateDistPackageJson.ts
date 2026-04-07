import fs from 'node:fs';

import { getPackageJson } from '../../getPackageJson';
import type { IBuildContext, IDependencyVersions } from '../types';

const NPM_PACKAGE_NAME = '@alexgorbatchev/dotfiles';
const NPM_PUBLIC_REGISTRY_URL = 'https://registry.npmjs.org/';
const PUBLIC_PACKAGE_KEYWORDS: string[] = [
  'dotfiles',
  'cli',
  'developer-tools',
  'tool-installer',
  'shell',
  'bun',
];

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

  const rootPackageJson = getPackageJson();
  const packageJson: Record<string, unknown> = {
    name: NPM_PACKAGE_NAME,
    version: rootPackageJson.version,
    description: 'Declarative, versioned dotfiles management with generated shims and shell integration.',
    license: 'MIT',
    repository: {
      type: 'git',
      url: 'git+https://github.com/alexgorbatchev/dotfiles.git',
    },
    homepage: 'https://github.com/alexgorbatchev/dotfiles#readme',
    bugs: {
      url: 'https://github.com/alexgorbatchev/dotfiles/issues',
    },
    keywords: PUBLIC_PACKAGE_KEYWORDS,
    type: 'module',
    main: './cli.js',
    bin: {
      dotfiles: 'cli.js',
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
    files: ['*.js', '*.js.map', '*.d.ts', '*.css', 'skill', 'README.md', 'LICENSE'],
    publishConfig: {
      registry: NPM_PUBLIC_REGISTRY_URL,
      access: 'public',
    },
    dependencies,
  };

  fs.writeFileSync(context.paths.outputPackageJsonPath, JSON.stringify(packageJson, null, 2));
}
