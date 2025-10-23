import type { IFileSystem } from '@dotfiles/file-system';
import { TrackedFileSystem } from '@dotfiles/registry/file';

/**
 * Creates a tool-specific file system instance
 * Extracted from duplicated setup code across all installation methods
 */
export function createToolFileSystem(fs: IFileSystem, toolName: string): IFileSystem {
  return fs instanceof TrackedFileSystem ? fs.withToolName(toolName) : fs;
}
