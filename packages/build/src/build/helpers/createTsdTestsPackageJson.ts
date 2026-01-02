import type { IBuildContext } from '../types';

/**
 * Writes the package.json for the temporary tsd tests project.
 */
export async function createTsdTestsPackageJson(context: IBuildContext): Promise<void> {
  const packageJsonDependencies: Record<string, string> = {
    '@gitea/dotfiles': `file://${context.paths.outputDir}`,
    '@types/node': '*',
  };

  const packageJson: Record<string, unknown> = {
    name: 'tsd-tests',
    private: true,
    type: 'module',
    types: './index.d.ts',
    dependencies: packageJsonDependencies,
  };

  await Bun.write(context.paths.tsdTestsPackageJsonPath, JSON.stringify(packageJson, null, 2));
}
