import type { IBinaryConfig, ToolBinary } from "@dotfiles/core";

/**
 * Normalizes a mixed array of strings and IBinaryConfig objects to a consistent IBinaryConfig array.
 * Converts string entries to IBinaryConfig objects with flexible minimatch glob patterns.
 *
 * Pattern Generation:
 * - String 'tool' becomes object with name: 'tool', pattern: '{,star/}tool'
 * - Pattern matches both 'tool' and 'dir/tool' using minimatch glob syntax
 * - Allows binaries to be located at root or one directory deep in archives
 *
 * Fallback Behavior:
 * - If binaries array is empty or undefined, returns an empty array (no binaries configured)
 * - Tools that do not call .bin() will have no shims generated
 *
 * @param binaries - Array of strings or IBinaryConfig objects, or undefined
 * @returns Array of IBinaryConfig objects with minimatch glob patterns for locating binaries
 */
export function normalizeBinaries(binaries: ToolBinary[] | undefined): IBinaryConfig[] {
  if (!binaries || binaries.length === 0) {
    return [];
  }

  return binaries.map((binary) => (typeof binary === "string" ? { name: binary, pattern: `{,*/}${binary}` } : binary));
}
