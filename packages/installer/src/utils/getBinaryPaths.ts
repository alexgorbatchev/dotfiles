import type { ToolBinary } from "@dotfiles/core";
import { join } from "node:path";
import { normalizeBinaries } from "./normalizeBinaries";

/**
 * Generates full paths for all binaries by combining install directory with binary names.
 * Normalizes the binaries input and constructs absolute paths for each binary.
 *
 * Used to create the binaryPaths array in InstallResult, providing full paths to
 * all installed binaries. These paths are used for:
 * - Registry tracking
 * - Shim generation
 * - Verification
 *
 * @param binaries - Array of strings or IBinaryConfig objects, or undefined
 * @param installedDir - Directory where binaries are installed
 * @returns Array of absolute paths to binaries (e.g., ['/path/to/install/rg', '/path/to/install/ripgrep'])
 */
export function getBinaryPaths(binaries: ToolBinary[] | undefined, installedDir: string): string[] {
  const normalizedBinaries = normalizeBinaries(binaries);
  return normalizedBinaries.map((binary) => join(installedDir, binary.name));
}
