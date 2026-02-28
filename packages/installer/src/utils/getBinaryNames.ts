import type { IBinaryConfig } from '@dotfiles/core';
import { normalizeBinaries } from './normalizeBinaries';

/**
 * Extracts binary names from a mixed binaries array without path information.
 * Normalizes the input and returns only the name property from each IBinaryConfig.
 *
 * Used when you need just the binary names for operations like:
 * - Listing installed binaries
 * - Checking binary existence
 * - Creating completion files
 *
 * @param binaries - Array of strings or IBinaryConfig objects, or undefined
 * @returns Array of binary names (e.g., ['rg', 'ripgrep'])
 */
export function getBinaryNames(binaries: (string | IBinaryConfig)[] | undefined): string[] {
  const normalizedBinaries = normalizeBinaries(binaries);
  return normalizedBinaries.map((config) => config.name);
}
