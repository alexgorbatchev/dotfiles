/**
 * Normalizes user-provided version by stripping any prefix to get the core version.
 *
 * Examples:
 * - "2.24.0" → "2.24.0"
 * - "v2.24.0" → "2.24.0"
 * - "1.0.0-beta.1" → "1.0.0-beta.1"
 * - "v1.0.0-rc1" → "1.0.0-rc1"
 */
export function normalizeUserVersion(version: string): string {
  // Match semver-like pattern: major.minor with optional patch and prerelease
  const semverPattern = /(\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?)/;
  const match = version.match(semverPattern);

  if (!match) {
    // No version pattern found, return original
    return version;
  }

  // Return just the version number portion
  const matchedVersion = match[1];
  if (!matchedVersion) {
    return version;
  }
  return matchedVersion;
}
