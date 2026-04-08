import type { ISystemInfo } from "@dotfiles/core";
import { getArchitecturePatterns } from "./getArchitecturePatterns";
import { getArchitectureRegex } from "./getArchitectureRegex";

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
 * Applies a regex filter to a list of candidates, keeping the result only if
 * it yields a non-empty subset. This is the core of zinit's iterative filtering.
 *
 * ```shell
 * filtered=( ${(M)list[@]:#(#i)*${~part}*} ) && (( $#filtered > 0 )) && list=( ${filtered[@]} )
 * ```
 */
function applySoftFilter(candidates: string[], pattern: string): string[] {
  const regex = new RegExp(pattern, "i");
  const filtered = candidates.filter((name) => regex.test(name.toLowerCase()));
  return filtered.length > 0 ? filtered : candidates;
}

/**
 * Selects the best matching asset from a list based on architecture patterns,
 * using zinit's iterative filtering approach.
 *
 * The filtering works in two phases:
 * 1. **Hard filter**: System pattern must match. Assets that don't match the OS
 *    are eliminated. If nothing matches, returns `undefined`.
 * 2. **Soft filters**: CPU and variant patterns are applied iteratively. Each
 *    filter is only applied if it yields results AND there are still multiple
 *    candidates. This handles assets that omit CPU identifiers (e.g.,
 *    `onefetch-mac.tar.gz`) by treating them as architecture-agnostic.
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
  const patterns = getArchitecturePatterns(systemInfo);

  // First pass: filter out non-binary files (checksums, signatures, etc.)
  const binaryAssets = filterNonBinaryAssets(assetNames);

  // Hard filter: system pattern is required — assets must match the OS.
  let matches: string[];

  if (architectureRegex.systemPattern) {
    const systemRegex = new RegExp(architectureRegex.systemPattern, "i");
    matches = binaryAssets.filter((name) => systemRegex.test(name.toLowerCase()));
  } else {
    matches = [...binaryAssets];
  }

  if (matches.length === 0) {
    return undefined;
  }

  // Soft filters: CPU then variants, applied iteratively (zinit behavior).
  // Each filter only narrows when it yields results and >1 candidates remain.
  const softFilters: string[] = [];

  if (architectureRegex.cpuPattern) {
    softFilters.push(architectureRegex.cpuPattern);
  }

  softFilters.push(...patterns.variants);

  for (const filter of softFilters) {
    if (matches.length <= 1) {
      break;
    }

    matches = applySoftFilter(matches, filter);
  }

  // Return the first match. If only one remains, it's the best one.
  // If multiple still remain, the first one is chosen as the default.
  return matches[0];
}
