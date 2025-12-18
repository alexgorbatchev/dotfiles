import { BuildError } from '../handleBuildError';

/**
 * Picks a subset of versions from a version map for the given package names.
 */
export function pickPackageVersions(
  packageNames: string[],
  versionsByName: Record<string, string>
): Record<string, string> {
  const selected: Record<string, string> = {};

  for (const packageName of packageNames) {
    const version: string | undefined = versionsByName[packageName];
    if (!version) {
      throw new BuildError(`Missing version for ${packageName}`);
    }
    selected[packageName] = version;
  }

  return selected;
}
