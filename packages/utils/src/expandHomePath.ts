/**
 * Expands the tilde (~) character in file paths to the user's home directory.
 * @param homeDir - The user's home directory.
 * @param path - The file path that may contain a tilde.
 * @returns The path with the tilde expanded to the user's home directory.
 */
export function expandHomePath(homeDir: string, path: string): string {
  if (path.startsWith('~/') || path === '~') {
    return path.replace(/^~(?=$|\/|\\)/, homeDir);
  }
  return path;
}
