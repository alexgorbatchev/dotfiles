/**
 * Normalizes a version string to be safe for use in file paths.
 *
 * This function replaces characters that are unsafe for file systems
 * (like /, :, \, etc.) with safe alternatives or removes them.
 *
 * @param version - Raw version string
 * @returns Path-safe version string
 */
export function normalizeVersion(version: string): string {
  if (!version) {
    return version;
  }

  // Replace common unsafe characters
  // / -> -
  // \ -> -
  // : -> -
  // < -> _
  // > -> _
  // " -> _
  // | -> _
  // ? -> _
  // * -> _
  return version
    .replace(/[/\\]/g, '-')
    .replace(/[:]/g, '-')
    .replace(/[<>"|?*]/g, '_')
    .trim();
}
