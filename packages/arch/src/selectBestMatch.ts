import type { SystemInfo } from '@dotfiles/schemas';
import { getArchitecturePatterns } from './getArchitecturePatterns';
import { getArchitectureRegex } from './getArchitectureRegex';
import { matchesArchitecture } from './matchesArchitecture';

/**
 * Selects the best matching asset from a list based on architecture patterns,
 * including variant-based disambiguation.
 *
 * This function implements Zinit's full selection logic:
 * 1. It first filters the list of asset names by the primary `system` and `cpu`
 *    patterns using `matchesArchitecture`.
 * 2. If multiple assets match, it then attempts to narrow down the selection by
 *    iterating through the `variants` patterns (e.g., 'musl', 'gnu').
 * 3. A variant is only used to filter the list if it results in a non-empty
 *    subset of matches. This prevents a variant from eliminating all candidates.
 * 4. The process continues until only one match remains or all variants have
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
 *
 * @public
 */
export function selectBestMatch(assetNames: string[], systemInfo: SystemInfo): string | undefined {
  const architectureRegex = getArchitectureRegex(systemInfo);

  // First pass: filter by system and CPU patterns
  let matches = assetNames.filter((name) => matchesArchitecture(name, architectureRegex));

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
