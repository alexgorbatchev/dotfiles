import type { BinaryConfig } from '@dotfiles/core';
import { normalizeBinaries } from './normalizeBinaries';

/**
 * Extracts binary names from a mixed binaries array without path information.
 * Normalizes the input and returns only the name property from each BinaryConfig.
 *
 * Used when you need just the binary names for operations like:
 * - Listing installed binaries
 * - Checking binary existence
 * - Creating completion files
 *
 * @param binaries - Array of strings or BinaryConfig objects, or undefined
 * @param fallbackName - Name to use if binaries array is empty or undefined
 * @returns Array of binary names (e.g., ['rg', 'ripgrep'])
 */
export function getBinaryNames(binaries: (string | BinaryConfig)[] | undefined, fallbackName: string): string[] {
  const normalizedBinaries = normalizeBinaries(binaries, fallbackName);
  return normalizedBinaries.map((config) => config.name);
}
