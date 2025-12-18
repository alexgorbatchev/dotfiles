import { $ } from 'bun';

import { BuildError } from '../handleBuildError';
import { escapeRegExp } from './escapeRegExp';

/**
 * Resolves installed package versions by parsing `bun pm ls --all` output.
 */
export async function getInstalledPackageVersions(packageNames: string[]): Promise<Record<string, string>> {
  const pmLsResult = await $`bun pm ls --all`.quiet();
  const pmLsOutput: string = pmLsResult.stdout.toString();

  const uniquePackageNames: string[] = Array.from(new Set(packageNames)).sort((a, b) => a.localeCompare(b));
  const versionsByName: Record<string, string> = {};

  for (const packageName of uniquePackageNames) {
    const escapedPackageName: string = escapeRegExp(packageName);
    const pattern: RegExp = new RegExp(`${escapedPackageName}@([^\\s]+)`);
    const match: RegExpMatchArray | null = pmLsOutput.match(pattern);
    const version: string | undefined = match?.[1];

    if (!version) {
      throw new BuildError(`Could not find ${packageName} version in bun pm ls output`);
    }

    versionsByName[packageName] = version;
  }

  return versionsByName;
}
