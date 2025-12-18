import { BuildError } from '../handleBuildError';

/**
 * Returns a package version from a map, throwing when the version is missing.
 */
export function getRequiredPackageVersion(packageName: string, versionsByName: Record<string, string>): string {
  const version: string | undefined = versionsByName[packageName];
  if (!version) {
    throw new BuildError(`Missing version for ${packageName}`);
  }
  return version;
}
