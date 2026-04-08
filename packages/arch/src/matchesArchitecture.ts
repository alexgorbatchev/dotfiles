import type { IArchitectureRegex } from "./types";

/**
 * Checks if a given asset name matches the specified architecture patterns.
 *
 * This utility function is used to filter a list of release assets (e.g., from
 * a GitHub release) to find those that are compatible with the current system's
 * architecture. It performs a case-insensitive match against the system and CPU
 * patterns.
 *
 * The logic is based on Zinit's filtering mechanism, where `system` and `cpu`
 * patterns are required for a primary match. `variant` patterns are not strictly
 * required here but can be used by a caller (like `selectBestMatch`) to
 * disambiguate when multiple assets match.
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
 * @param assetName - The name of the release asset to check (e.g., `mytool-linux-amd64.tar.gz`).
 * @param architectureRegex - An object containing the regex patterns for system and CPU.
 * @returns `true` if the asset name matches both the system and CPU patterns, otherwise `false`.
 */
export function matchesArchitecture(assetName: string, architectureRegex: IArchitectureRegex): boolean {
  const lowerAssetName = assetName.toLowerCase();

  // System and CPU patterns are the primary filters.
  // Both must match for an asset to be considered compatible.
  const systemMatch = architectureRegex.systemPattern
    ? new RegExp(architectureRegex.systemPattern, "i").test(lowerAssetName)
    : true;

  const cpuMatch = architectureRegex.cpuPattern
    ? new RegExp(architectureRegex.cpuPattern, "i").test(lowerAssetName)
    : true;

  // Variants (musl/gnu, mingw/msys, eabihf, etc.) are used by zinit for
  // tie-breaking when multiple assets match, but most binaries don't include
  // this info in filenames. Example:
  // - Common: fzf-0.66.0-linux_amd64.tar.gz (no variant)
  // - Rare: ripgrep-x.y.z-x86_64-unknown-linux-musl.tar.gz (has variant)
  //
  // We don't require variants here. If the caller needs to disambiguate
  // multiple matches, they can apply variant filtering as a second pass.
  return systemMatch && cpuMatch;
}
