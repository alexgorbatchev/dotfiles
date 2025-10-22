import type { BinaryConfig } from '@dotfiles/schemas';

/**
 * Normalizes a mixed array of strings and BinaryConfig objects to a consistent BinaryConfig array.
 * String entries are converted to BinaryConfig objects with robust minimatch glob patterns that try
 * both subdirectory patterns (e.g., star/tool) and direct paths as fallback.
 *
 * @param binaries - Array of strings or BinaryConfig objects, or undefined
 * @param fallbackName - Name to use if binaries is undefined or empty
 * @returns Array of BinaryConfig objects with minimatch glob patterns
 */
export function normalizeBinaries(
  binaries: (string | BinaryConfig)[] | undefined,
  fallbackName: string
): BinaryConfig[] {
  if (!binaries || binaries.length === 0) {
    return [{ name: fallbackName, pattern: `*/${fallbackName}` }];
  }

  return binaries.map((binary) => (typeof binary === 'string' ? { name: binary, pattern: `*/${binary}` } : binary));
}
