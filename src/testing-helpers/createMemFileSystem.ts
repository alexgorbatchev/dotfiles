import { MemFileSystem, type IFileSystem } from '@modules/file-system';
import type { DirectoryJSON } from 'memfs';

/**
 * Creates a mock `IFileSystem` instance using `MemFileSystem`.
 *
 * @param initialVolumeJson - Optional JSON object (memfs DirectoryJSON) to initialize the file system volume.
 *                            Keys are file paths, values are file content (string, Buffer) or null for directories.
 * @returns A new `MemFileSystem` instance.
 */
export function createMemFileSystem(initialVolumeJson?: DirectoryJSON): IFileSystem {
  if (initialVolumeJson) {
    // MemFileSystem constructor can take DirectoryJSON directly
    return new MemFileSystem(initialVolumeJson);
  }
  return new MemFileSystem();
}
