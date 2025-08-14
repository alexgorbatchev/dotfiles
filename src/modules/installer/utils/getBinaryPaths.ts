import type { BinaryConfig } from '@types';
import { normalizeBinaries } from './normalizeBinaries';

/**
 * Gets binary paths for installation results from a mixed binaries array.
 *
 * @param binaries - Array of strings or BinaryConfig objects, or undefined
 * @param fallbackName - Name to use if binaries is undefined or empty
 * @param installDir - Directory where binaries are installed
 * @returns Array of full binary paths
 */
export function getBinaryPaths(
  binaries: (string | BinaryConfig)[] | undefined,
  fallbackName: string,
  installDir: string
): string[] {
  const normalizedBinaries = normalizeBinaries(binaries, fallbackName);
  return normalizedBinaries.map((binary) => require('node:path').join(installDir, binary.name));
}
