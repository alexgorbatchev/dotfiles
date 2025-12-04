/**
 * Strips the 'v' or 'V' prefix from a version string.
 *
 * @param version - Raw version string that may have a v/V prefix
 * @returns Version string without the v/V prefix
 *
 * @example
 * ```typescript
 * stripVersionPrefix('v1.2.3'); // Returns: '1.2.3'
 * stripVersionPrefix('V1.2.3'); // Returns: '1.2.3'
 * stripVersionPrefix('1.2.3');  // Returns: '1.2.3'
 * ```
 */
export function stripVersionPrefix(version: string): string {
  if (!version) {
    return version;
  }

  if (version.startsWith('v') || version.startsWith('V')) {
    return version.slice(1);
  }

  return version;
}
