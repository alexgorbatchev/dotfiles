/**
 * Detects the tag prefix used by a GitHub repository by analyzing a tag string.
 *
 * Examples:
 * - "v2.24.0" → "v"
 * - "jq-1.8.1" → "jq-"
 * - "15.1.0" → ""
 * - "tool-v1.2.3" → "tool-v"
 */
export function detectTagPrefix(tag: string): string {
  // Match semver-like pattern: major.minor with optional patch and prerelease
  // This regex finds the first occurrence of a version number
  const semverPattern = /\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?/;
  const match = tag.match(semverPattern);

  if (!match || match.index === undefined) {
    // No version pattern found, return empty prefix
    return "";
  }

  // Everything before the version number is the prefix
  const prefix: string = tag.slice(0, match.index);
  return prefix;
}
