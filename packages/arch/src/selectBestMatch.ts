import { Libc, Platform, type ISystemInfo } from "@dotfiles/core";
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

const GNU_VARIANT_PATTERN = /(^|[^a-z0-9])(gnu|glibc)([^a-z0-9]|$)/i;
const MUSL_VARIANT_PATTERN = /(^|[^a-z0-9])musl([^a-z0-9]|$)/i;

type LinuxVariant = "generic" | "gnu" | "musl";

function classifyLinuxVariant(assetName: string): LinuxVariant {
  if (MUSL_VARIANT_PATTERN.test(assetName)) {
    return "musl";
  }

  if (GNU_VARIANT_PATTERN.test(assetName)) {
    return "gnu";
  }

  return "generic";
}

function rankLinuxVariant(variant: LinuxVariant, libc: Libc | undefined): number {
  switch (libc ?? Libc.Unknown) {
    case Libc.Gnu:
      switch (variant) {
        case "gnu":
          return 0;
        case "generic":
          return 1;
        default:
          return 2;
      }
    case Libc.Musl:
      switch (variant) {
        case "musl":
          return 0;
        case "generic":
          return 1;
        default:
          return 2;
      }
    default:
      switch (variant) {
        case "generic":
          return 0;
        case "gnu":
          return 1;
        default:
          return 2;
      }
  }
}

function selectBestLinuxMatch(assetNames: string[], libc: Libc | undefined): string {
  let bestAssetName = assetNames[0] ?? "";
  let bestRank = Number.POSITIVE_INFINITY;

  for (const assetName of assetNames) {
    const variant = classifyLinuxVariant(assetName);
    const rank = rankLinuxVariant(variant, libc);

    if (rank < bestRank) {
      bestAssetName = assetName;
      bestRank = rank;
    }
  }

  return bestAssetName;
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

  if (architectureRegex.cpuPattern && matches.length > 1) {
    matches = applySoftFilter(matches, architectureRegex.cpuPattern);
  }

  if (matches.length <= 1) {
    return matches[0];
  }

  if (systemInfo.platform === Platform.Linux) {
    return selectBestLinuxMatch(matches, systemInfo.libc);
  }

  for (const filter of patterns.variants) {
    if (matches.length <= 1) {
      break;
    }

    matches = applySoftFilter(matches, filter);
  }

  // Return the first match. If only one remains, it's the best one.
  // If multiple still remain, the first one is chosen as the default.
  return matches[0];
}
