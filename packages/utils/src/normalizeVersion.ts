import { clean, valid } from 'semver';

/**
 * Normalizes a version string to proper semantic versioning format.
 *
 * This function ensures consistent version formatting across all installation methods
 * by leveraging semver.clean() and handling edge cases like build metadata preservation.
 *
 * @param version - Raw version string from any source (GitHub tags, brew info, etc.)
 * @returns Normalized semver string, or the original if it cannot be normalized
 *
 * @example
 * ```typescript
 * normalizeVersion('v1.2.3')    // '1.2.3'
 * normalizeVersion('1.2.3')     // '1.2.3'
 * normalizeVersion('V1.2.3')    // '1.2.3'
 * ```
 *
 * @remarks
 * The function performs the following normalization steps:
 * 1. Converts uppercase 'V' to lowercase 'v' (semver.clean handles lowercase 'v')
 * 2. Uses semver.clean() to normalize to standard format
 * 3. Preserves build metadata which semver.clean() strips
 * 4. Returns original version if semver.clean() fails
 */
export function normalizeVersion(version: string): string {
  if (!version) {
    return version;
  }

  // Handle uppercase V prefix (semver.clean handles lowercase v)
  let normalized: string = version;
  if (normalized.startsWith('V')) {
    normalized = `v${normalized.slice(1)}`;
  }

  // Use semver.clean to normalize to proper semver format
  // This handles the 'v' prefix and cases like "1.2" -> "1.2.0"
  // Note: semver.clean() strips build metadata, so we need to preserve it
  const hasBuildMetadata: boolean = normalized.includes('+');
  const buildMetadata: string = hasBuildMetadata ? normalized.split('+')[1] || '' : '';

  const cleaned: string | null = clean(normalized);
  if (cleaned && valid(cleaned)) {
    // Re-add build metadata if it was present
    return hasBuildMetadata ? `${cleaned}+${buildMetadata}` : cleaned;
  }

  // If semver.clean didn't work, return the original version
  // This handles edge cases where the version might not be strict semver
  // but is still useful (e.g., "2024.01" date-based versions)
  return version;
}
