import type { IBinaryConfig } from '@dotfiles/core';
import { normalizeBinaries } from './normalizeBinaries';

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
 * @param fallbackName - Name to use if binaries array is empty or undefined
 * @param installDir - Directory where binaries are installed
 * @returns Array of absolute paths to binaries (e.g., ['/path/to/install/rg', '/path/to/install/ripgrep'])
 */
export function getBinaryPaths(
  binaries: (string | IBinaryConfig)[] | undefined,
  fallbackName: string,
  installDir: string
): string[] {
  const normalizedBinaries = normalizeBinaries(binaries, fallbackName);
  return normalizedBinaries.map((binary) => require('node:path').join(installDir, binary.name));
}
