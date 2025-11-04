import type { BinaryConfig } from '@dotfiles/core';
import { normalizeBinaries } from './normalizeBinaries';

/**
 * Extracts just the binary names from a mixed binaries array.
 *
 * @param binaries - Array of strings or BinaryConfig objects, or undefined
 * @param fallbackName - Name to use if binaries is undefined or empty
 * @returns Array of binary names
 */
export function getBinaryNames(binaries: (string | BinaryConfig)[] | undefined, fallbackName: string): string[] {
  const normalizedBinaries = normalizeBinaries(binaries, fallbackName);
  return normalizedBinaries.map((config) => config.name);
}
