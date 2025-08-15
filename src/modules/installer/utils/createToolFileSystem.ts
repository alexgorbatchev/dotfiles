import { TrackedFileSystem } from '@modules/file-registry';
import type { IFileSystem } from '@modules/file-system/IFileSystem';

/**
 * Creates a tool-specific file system instance
 * Extracted from duplicated setup code across all installation methods
 */
export function createToolFileSystem(fs: IFileSystem, toolName: string): IFileSystem {
  return fs instanceof TrackedFileSystem ? fs.withToolName(toolName) : fs;
}
