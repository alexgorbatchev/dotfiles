import { detectTagPrefix } from "./detectTagPrefix";
import { normalizeUserVersion } from "./normalizeUserVersion";

/**
 * Builds a corrected tag by combining the detected prefix from the latest tag
 * with the normalized user-provided version.
 *
 * Examples:
 * - latestTag: "v2.24.0", userVersion: "2.23.0" → "v2.23.0"
 * - latestTag: "jq-1.8.1", userVersion: "1.7.0" → "jq-1.7.0"
 * - latestTag: "15.1.0", userVersion: "v15.0.0" → "15.0.0"
 */
export function buildCorrectedTag(latestTag: string, userVersion: string): string {
  const prefix = detectTagPrefix(latestTag);
  const normalizedVersion = normalizeUserVersion(userVersion);
  const correctedTag: string = `${prefix}${normalizedVersion}`;
  return correctedTag;
}
