import type { BinaryConfig } from '@dotfiles/core';

/**
 * Normalizes a mixed array of strings and BinaryConfig objects to a consistent BinaryConfig array.
 * Converts string entries to BinaryConfig objects with flexible minimatch glob patterns.
 *
 * Pattern Generation:
 * - String 'tool' becomes object with name: 'tool', pattern: '{,star/}tool'
 * - Pattern matches both 'tool' and 'dir/tool' using minimatch glob syntax
 * - Allows binaries to be located at root or one directory deep in archives
 *
 * Fallback Behavior:
 * - If binaries array is empty or undefined, creates config for fallbackName
 * - Ensures every tool has at least one binary configured
 *
 * @param binaries - Array of strings or BinaryConfig objects, or undefined
 * @param fallbackName - Name to use as single binary if binaries is empty or undefined
 * @returns Array of BinaryConfig objects with minimatch glob patterns for locating binaries
 */
export function normalizeBinaries(
  binaries: (string | BinaryConfig)[] | undefined,
  fallbackName: string
): BinaryConfig[] {
  if (!binaries || binaries.length === 0) {
    return [{ name: fallbackName, pattern: `{,*/}${fallbackName}` }];
  }

  return binaries.map((binary) => (typeof binary === 'string' ? { name: binary, pattern: `{,*/}${binary}` } : binary));
}
