import type { SystemInfo } from '@dotfiles/schemas';
import { getArchitecturePatterns } from './getArchitecturePatterns';
import { getArchitectureRegex } from './getArchitectureRegex';
import { matchesArchitecture } from './matchesArchitecture';

/**
 * Selects the best matching asset from a list based on architecture patterns.
 * Implements zinit's full selection logic with variant-based disambiguation.
 *
 * Zinit's filtering logic:
 * 1. Filter by system and CPU patterns
 * 2. If multiple matches remain, iterate through variants IN ORDER
 * 3. For each variant, only apply filter if it produces results
 * 4. Return first match
 *
 * for part in "${parts[@]}"; do
 *   if (( $#list > 1 )); then
 *     filtered=( ${(M)list[@]:#(#i)*${~part}*} ) && (( $#filtered > 0 )) && list=( ${filtered[@]} )
 *   else
 *     break
 *   fi
 * done
 *
 * @param assetNames - Array of asset names to select from
 * @param systemInfo - System information for architecture detection
 * @returns The best matching asset name, or undefined if no match
 */
export function selectBestMatch(assetNames: string[], systemInfo: SystemInfo): string | undefined {
  const architectureRegex = getArchitectureRegex(systemInfo);

  // First pass: filter by system and CPU patterns
  let matches = assetNames.filter((name) => matchesArchitecture(name, architectureRegex));

  if (matches.length === 0) {
    return undefined;
  }

  // Zinit behavior: if multiple matches remain, try each variant in order
  // The order matters - we prefer earlier variants in the list
  if (matches.length > 1) {
    const patterns = getArchitecturePatterns(systemInfo);

    // Iterate through variants in order (musl before gnu, mingw before msys, etc.)
    for (const variant of patterns.variants) {
      if (matches.length <= 1) {
        break;
      }

      // Try filtering by this variant
      const variantRegex = new RegExp(variant, 'i');
      const variantMatches = matches.filter((name) => variantRegex.test(name.toLowerCase()));

      // Only use variant filtering if it produces matches
      if (variantMatches.length > 0) {
        matches = variantMatches;
      }
    }
  }

  // Return first match (if only one remains, perfect; if multiple, take first)
  return matches[0];
}
