import type { IFileSystem } from "@dotfiles/file-system";
import { TrackedFileSystem } from "@dotfiles/registry/file";

/**
 * Creates a tool-specific file system instance for proper operation tracking.
 * If the provided filesystem is a TrackedFileSystem, returns a new instance scoped to the tool name.
 * Otherwise, returns the original filesystem unchanged.
 *
 * This enables the registry to track which files belong to which tools by associating
 * all file operations with the tool name.
 *
 * @param fs - Base file system instance (may be TrackedFileSystem)
 * @param toolName - Name of the tool for tracking operations
 * @returns Tool-scoped file system or original filesystem
 */
export function createToolFileSystem(fs: IFileSystem, toolName: string): IFileSystem {
  return fs instanceof TrackedFileSystem ? fs.withToolName(toolName) : fs;
}
