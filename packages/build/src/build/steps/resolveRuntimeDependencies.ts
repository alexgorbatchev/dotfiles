import { getExternalRuntimeDependenciesFromBundle } from '../bundle-helpers';
import { getInstalledPackageVersions } from '../helpers/getInstalledPackageVersions';
import { getRequiredPackageVersion } from '../helpers/getRequiredPackageVersion';
import { pickPackageVersions } from '../helpers/pickPackageVersions';
import type { IBuildContext, IDependencyVersions, IResolvedRuntimeDependencies } from '../types';

/**
 * Derives runtime dependencies from the built bundle and resolves their installed versions for packaging.
 */
export async function resolveRuntimeDependencies(context: IBuildContext): Promise<IResolvedRuntimeDependencies> {
  const externalRuntimeDependencies: string[] = await getExternalRuntimeDependenciesFromBundle(
    context.paths.cliOutputFile,
  );

  const packageNamesToResolve: string[] = [...externalRuntimeDependencies, 'zod', '@types/bun', '@types/node'];
  const allResolvedVersions: Record<string, string> = await getInstalledPackageVersions(packageNamesToResolve);

  const runtimeDependencyVersions: Record<string, string> = pickPackageVersions(
    externalRuntimeDependencies,
    allResolvedVersions,
  );

  const dependencyVersions: IDependencyVersions = {
    zod: getRequiredPackageVersion('zod', allResolvedVersions),
    bunTypes: getRequiredPackageVersion('@types/bun', allResolvedVersions),
    nodeTypes: getRequiredPackageVersion('@types/node', allResolvedVersions),
  };

  const result: IResolvedRuntimeDependencies = {
    externalRuntimeDependencies,
    runtimeDependencyVersions,
    dependencyVersions,
  };

  return result;
}
