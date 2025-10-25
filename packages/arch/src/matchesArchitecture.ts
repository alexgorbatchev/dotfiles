import type { ArchitectureRegex } from './types';

/**
 * Utility function to check if an asset name matches the architecture.
 * This can be used to filter GitHub release assets.
 *
 * Based on zinit's filtering logic in .zinit-get-latest-gh-r-url-part:
 *
 * for part in "${parts[@]}"; do
 *   if (( $#list > 1 )); then
 *     filtered=( ${(M)list[@]:#(#i)*${~part}*} ) && (( $#filtered > 0 )) && list=( ${filtered[@]} )
 *   else
 *     break
 *   fi
 * done
 *
 * Key insights:
 * 1. Patterns filter sequentially: system, then cpu, then variants
 * 2. Each pattern only filters IF it produces matches (otherwise keeps current list)
 * 3. Loop BREAKS if only 1 item remains (no further filtering needed)
 *
 * This means variants are used for TIE-BREAKING when multiple assets match system+cpu,
 * but are NOT required - most binaries don't include variant info in their names.
 *
 * Our simplified implementation:
 * - We check system + cpu patterns (required)
 * - We don't enforce variant patterns (they're for disambiguation in zinit's multi-match logic)
 * - When multiple matches exist, the caller can use variants to narrow down further
 *
 * @param assetName - Name of the GitHub release asset
 * @param architectureRegex - Regex patterns from getArchitectureRegex
 * @returns True if the asset matches the current architecture
 */
export function matchesArchitecture(assetName: string, architectureRegex: ArchitectureRegex): boolean {
  const lowerAssetName = assetName.toLowerCase();

  // System and CPU patterns are the primary filters
  // Both must match for an asset to be considered compatible
  const systemMatch = architectureRegex.systemPattern
    ? new RegExp(architectureRegex.systemPattern, 'i').test(lowerAssetName)
    : true;

  const cpuMatch = architectureRegex.cpuPattern
    ? new RegExp(architectureRegex.cpuPattern, 'i').test(lowerAssetName)
    : true;

  // Variants (musl/gnu, mingw/msys, eabihf, etc.) are used by zinit for
  // tie-breaking when multiple assets match, but most binaries don't include
  // this info in filenames. Example:
  // - Common: fzf-0.66.0-linux_amd64.tar.gz (no variant)
  // - Rare: ripgrep-x.y.z-x86_64-unknown-linux-musl.tar.gz (has variant)
  //
  // We don't require variants here. If the caller needs to disambiguate
  // multiple matches, they can apply variant filtering as a second pass.

  const matches = systemMatch && cpuMatch;

  return matches;
}
