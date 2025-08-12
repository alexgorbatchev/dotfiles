/**
 * Contracts absolute paths by replacing the home directory with ~ for more readable logging.
 * @param homeDir - The user's home directory.
 * @param path - The file path to contract.
 * @returns The path with the home directory replaced by ~.
 */
export function contractHomePath(homeDir: string, path: string): string {
  if (path.startsWith(homeDir)) {
    const remainder = path.slice(homeDir.length);
    return remainder.startsWith('/') || remainder === '' ? `~${remainder}` : path;
  }
  return path;
}
