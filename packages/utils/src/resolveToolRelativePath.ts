import path from "node:path";

/**
 * Resolves a relative path against the tool configuration directory (toolDir).
 *
 * This provides consistent path resolution for all defineTool() APIs:
 * - Absolute paths are returned as-is
 * - Relative paths are resolved against toolDir (the .tool.ts file's directory)
 *
 * @param toolDir - Absolute path to the tool configuration directory (where .tool.ts lives)
 * @param inputPath - The path to resolve (may be absolute or relative)
 * @returns The resolved absolute path
 *
 * @example
 * // Relative path
 * resolveToolRelativePath('/home/user/dotfiles/tools/fzf', './shell/init.zsh')
 * // Returns: '/home/user/dotfiles/tools/fzf/shell/init.zsh'
 *
 * @example
 * // Absolute path (unchanged)
 * resolveToolRelativePath('/home/user/dotfiles/tools/fzf', '/usr/local/bin/fzf')
 * // Returns: '/usr/local/bin/fzf'
 */
export function resolveToolRelativePath(toolDir: string, inputPath: string): string {
  const trimmedPath = inputPath.trim();

  if (path.isAbsolute(trimmedPath)) {
    return trimmedPath;
  }

  return path.resolve(toolDir, trimmedPath);
}
