/**
 * @file generator/src/modules/file-system/IFileSystem.ts
 * @description Interface for file system operations.
 *
 * This interface defines a contract for file system interactions, allowing
 * for different implementations (e.g., real file system, virtual file system for tests).
 * All methods should be asynchronous and return Promises.
 */

import type { Stats as NodeStats } from 'fs'; // Changed from 'node:fs', aliased to avoid conflict if re-exporting

export type { NodeStats as Stats }; // Re-exporting Stats for consumers
export interface IFileSystem {
  /**
   * Reads the content of a file.
   * @param path The path to the file.
   * @param encoding The encoding to use (default: 'utf8').
   * @returns A promise that resolves with the file content as a string.
   */
  readFile(path: string, encoding?: BufferEncoding): Promise<string>;

  /**
   * Writes content to a file.
   * @param path The path to the file.
   * @param content The content to write.
   * @param encoding The encoding to use (default: 'utf8').
   * @returns A promise that resolves when the file has been written.
   */
  writeFile(
    path: string,
    content: string | NodeJS.ArrayBufferView,
    encoding?: BufferEncoding
  ): Promise<void>;

  /**
   * Checks if a file or directory exists.
   * @param path The path to check.
   * @returns A promise that resolves with true if the path exists, false otherwise.
   */
  exists(path: string): Promise<boolean>;

  /**
   * Creates a directory.
   * @param path The path of the directory to create.
   * @param options Options for creating the directory, e.g., { recursive: true }.
   * @returns A promise that resolves when the directory has been created.
   */
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;

  /**
   * Reads the contents of a directory.
   * @param path The path to the directory.
   * @returns A promise that resolves with an array of file and directory names.
   */
  readdir(path: string): Promise<string[]>;

  /**
   * Removes a file or directory. For directories, options.recursive must be true.
   * @param path The path to the file or directory to remove.
   * @param options Options for removal, e.g., { recursive: true, force: true }.
   * @returns A promise that resolves when the file or directory has been removed.
   */
  rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;

  /**
   * Removes a directory. (Prefer rm with recursive option for modern usage)
   * @param path The path to the directory to remove.
   * @param options Options for removing the directory, e.g., { recursive: true }.
   * @returns A promise that resolves when the directory has been removed.
   */
  rmdir(path: string, options?: { recursive?: boolean }): Promise<void>;

  /**
   * Gets file or directory stats.
   * @param path The path to the file or directory.
   * @returns A promise that resolves with the Stats object.
   */
  stat(path: string): Promise<NodeStats>; // Use aliased Stats

  /**
   * Gets file or directory stats without following symbolic links.
   * @param path The path to the file or directory.
   * @returns A promise that resolves with the Stats object for the link itself.
   */
  lstat(path: string): Promise<NodeStats>; // Added lstat

  /**
   * Creates a symbolic link.
   * @param target The path the symbolic link will point to.
   * @param path The path where the symbolic link will be created.
   * @param type The type of symbolic link (e.g., 'file', 'dir'). Optional, platform-dependent.
   * @returns A promise that resolves when the symbolic link has been created.
   */
  symlink(target: string, path: string, type?: 'file' | 'dir' | 'junction'): Promise<void>;

  /**
   * Reads the target of a symbolic link.
   * @param path The path of the symbolic link.
   * @returns A promise that resolves with the target path as a string.
   */
  readlink(path: string): Promise<string>;

  /**
   * Changes the permissions of a file or directory.
   * @param path The path to the file or directory.
   * @param mode The permissions mode (e.g., 0o755).
   * @returns A promise that resolves when the permissions have been changed.
   */
  chmod(path: string, mode: number | string): Promise<void>;

  /**
   * Copies a file.
   * @param src The source file path.
   * @param dest The destination file path.
   * @param flags Optional flags for the copy operation.
   * @returns A promise that resolves when the file has been copied.
   */
  copyFile(src: string, dest: string, flags?: number): Promise<void>;

  /**
   * Renames a file or directory.
   * @param oldPath The current path.
   * @param newPath The new path.
   * @returns A promise that resolves when the rename operation is complete.
   */
  rename(oldPath: string, newPath: string): Promise<void>;

  /**
   * Ensures that a directory exists. If the directory structure does not exist, it is created.
   * @param path The path of the directory.
   * @returns A promise that resolves when the directory exists.
   */
  ensureDir(path: string): Promise<void>;
}
