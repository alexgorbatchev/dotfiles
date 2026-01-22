import type { ISystemInfo } from '@dotfiles/core';
import { getArchitecturePatterns } from './getArchitecturePatterns';
import { getArchitectureRegex } from './getArchitectureRegex';
import { matchesArchitecture } from './matchesArchitecture';

/**
 * Patterns for non-binary files that should be excluded from asset selection.
 * Based on zinit's junk filtering logic:
 * ```zsh
 * local junk='*((s(ha256|ig|um)|386|asc|md5|txt|vsix)*|(apk|b3|deb|json|pkg|rpm|sh|zst)(#e))';
 * filtered=( ${(m@)list:#(#i)${~junk}} )
 * ```
 *
 * Categories:
 * - Checksum files: .sha256, .sha256sum, .sha512, .sha1, .md5, .sum, SHASUMS*
 * - Signature files: .sig, .asc, .pem
 * - Metadata files: .json, .txt, .sbom
 * - Package formats: .deb, .rpm, .apk, .pkg
 * - Build artifacts: buildable-artifact, .vsix
 * - Other: .b3 (BLAKE3), .zst (zstd)
 */
const NON_BINARY_PATTERNS: RegExp[] = [
  // Checksum files
  /\.sha\d+(sum)?$/i,
  /\.md5(sum)?$/i,
  /\.sum$/i,
  /^shasums/i,
  // Signature files
  /\.sig$/i,
  /\.asc$/i,
  /\.pem$/i,
  // Metadata files
  /\.json$/i,
  /\.txt$/i,
  /\.sbom$/i,
  // Package formats (not portable binaries)
  /\.deb$/i,
  /\.rpm$/i,
  /\.apk$/i,
  /\.pkg$/i,
  // Build artifacts
  /buildable-artifact/i,
  /\.vsix$/i,
  // Other non-binary formats
  /\.b3$/i,
  /\.zst$/i,
];

/**
 * Filters out non-binary files from asset names.
 * Only applies filter if it results in non-empty list (preserves candidates if all would be filtered).
 */
function filterNonBinaryAssets(assetNames: string[]): string[] {
  const filtered = assetNames.filter((name) => !NON_BINARY_PATTERNS.some((pattern) => pattern.test(name)));
  // Only apply filter if it yields results (zinit behavior)
  return filtered.length > 0 ? filtered : assetNames;
}

/**
 * Selects the best matching asset from a list based on architecture patterns,
 * including variant-based disambiguation.
 *
 * This function implements Zinit's full selection logic:
 * 1. It first filters out non-binary files (checksums, signatures, metadata).
 * 2. It then filters the list of asset names by the primary `system` and `cpu`
 *    patterns using `matchesArchitecture`.
 * 3. If multiple assets match, it then attempts to narrow down the selection by
 *    iterating through the `variants` patterns (e.g., 'musl', 'gnu').
 * 4. A variant is only used to filter the list if it results in a non-empty
 *    subset of matches. This prevents a variant from eliminating all candidates.
 * 5. The process continues until only one match remains or all variants have
 *    been tried.
 *
 * ```shell
 * # zinit filtering logic
 * for part in "${parts[@]}"; do
 *   if (( $#list > 1 )); then
 *     filtered=( ${(M)list[@]:#(#i)*${~part}*} ) && (( $#filtered > 0 )) && list=( ${filtered[@]} )
 *   else
 *     break
 *   fi
 * done
 * ```
 *
 * @param assetNames - An array of asset names to select from.
 * @param systemInfo - An object containing the system's architecture information.
 * @returns The name of the best matching asset, or `undefined` if no suitable match is found.
 */
export function selectBestMatch(assetNames: string[], systemInfo: ISystemInfo): string | undefined {
  const architectureRegex = getArchitectureRegex(systemInfo);

  // First pass: filter out non-binary files (checksums, signatures, etc.)
  const binaryAssets = filterNonBinaryAssets(assetNames);

  // Second pass: filter by system and CPU patterns
  let matches = binaryAssets.filter((name) => matchesArchitecture(name, architectureRegex));

  if (matches.length === 0) {
    return undefined;
  }

  // If multiple matches remain, use variants for tie-breaking.
  // The order of variants matters, as earlier ones are preferred.
  if (matches.length > 1) {
    const patterns = getArchitecturePatterns(systemInfo);

    for (const variant of patterns.variants) {
      if (matches.length <= 1) {
        break;
      }

      // Try filtering by the current variant
      const variantRegex = new RegExp(variant, 'i');
      const variantMatches = matches.filter((name) => variantRegex.test(name.toLowerCase()));

      // Only apply the variant filter if it yields results
      if (variantMatches.length > 0) {
        matches = variantMatches;
      }
    }
  }

  // Return the first match. If only one remains, it's the best one.
  // If multiple still remain, the first one is chosen as the default.
  return matches[0];
}
