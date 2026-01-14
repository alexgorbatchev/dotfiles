// re-export these to make build work
import type { Stats as NodeStats } from 'node:fs';
export type { NodeStats };
export type Stats = NodeStats;

export interface IFileSystem {
  /**
   * Reads the entire content of a file.
   * @param path - A path to a file.
   * @param encoding - The encoding to use.
   * @returns A promise that resolves with the file content as a string.
   */
  readFile(path: string, encoding?: BufferEncoding): Promise<string>;

  /**
   * Reads the entire content of a file.
   * @param path - A path to a file.
   * @returns A promise that resolves with the file content as a Buffer.
   */
  readFileBuffer(path: string): Promise<Buffer>;

  /**
   * Asynchronously writes data to a file, replacing the file if it already exists.
   * @param path - A path to a file.
   * @param content - The content to write.
   * @param encoding - The encoding to use.
   * @returns A promise that resolves when the file has been written.
   */
  writeFile(path: string, content: string | NodeJS.ArrayBufferView, encoding?: BufferEncoding): Promise<void>;

  /**
   * Checks if a file or directory exists.
   * @param path - A path to a file or directory.
   * @returns A promise that resolves with `true` if the path exists, `false` otherwise.
   */
  exists(path: string): Promise<boolean>;

  /**
   * Asynchronously creates a directory.
   * @param path - A path to a directory.
   * @param options - Options for creating the directory.
   * @returns A promise that resolves when the directory has been created.
   */
  mkdir(path: string, options?: { recursive?: boolean; }): Promise<void>;

  /**
   * Reads the contents of a directory.
   * @param path - A path to a directory.
   * @returns A promise that resolves with an array of file and directory names.
   */
  readdir(path: string): Promise<string[]>;

  /**
   * Removes a file or directory.
   * @param path - A path to a file or directory.
   * @param options - Options for removal.
   * @returns A promise that resolves when the file or directory has been removed.
   */
  rm(path: string, options?: { recursive?: boolean; force?: boolean; }): Promise<void>;

  /**
   * Asynchronously removes a directory.
   * @param path - A path to a directory.
   * @param options - Options for removing the directory.
   * @returns A promise that resolves when the directory has been removed.
   * @deprecated Use {@link IFileSystem.rm} with `recursive: true` instead.
   */
  rmdir(path: string, options?: { recursive?: boolean; }): Promise<void>;

  /**
   * Gets file or directory stats.
   * @param path - A path to a file or directory.
   * @returns A promise that resolves with the {@link NodeStats} object.
   */
  stat(path: string): Promise<NodeStats>;

  /**
   * Gets file or directory stats without following symbolic links.
   * @param path - A path to a file or directory.
   * @returns A promise that resolves with the {@link NodeStats} object for the link itself.
   */
  lstat(path: string): Promise<NodeStats>;

  /**
   * Creates a symbolic link.
   * @param target - A path the symbolic link will point to.
   * @param path - A path where the symbolic link will be created.
   * @param type - The type of symbolic link ('file', 'dir', or 'junction').
   * @returns A promise that resolves when the symbolic link has been created.
   */
  symlink(target: string, path: string, type?: 'file' | 'dir' | 'junction'): Promise<void>;

  /**
   * Reads the value of a symbolic link.
   * @param path - A path to a symbolic link.
   * @returns A promise that resolves with the target path as a string.
   */
  readlink(path: string): Promise<string>;

  /**
   * Changes the permissions of a file or directory.
   * @param path - A path to a file or directory.
   * @param mode - The permissions mode (e.g., `0o755`).
   * @returns A promise that resolves when the permissions have been changed.
   */
  chmod(path: string, mode: number | string): Promise<void>;

  /**
   * Asynchronously copies a file.
   * @param src - The source file path.
   * @param dest - The destination file path.
   * @param flags - Optional flags for the copy operation.
   * @returns A promise that resolves when the file has been copied.
   */
  copyFile(src: string, dest: string, flags?: number): Promise<void>;

  /**
   * Asynchronously renames a file or directory.
   * @param oldPath - The current path.
   * @param newPath - The new path.
   * @returns A promise that resolves when the rename operation is complete.
   */
  rename(oldPath: string, newPath: string): Promise<void>;

  /**
   * Ensures that a directory exists. If the directory structure does not exist, it is created.
   * @param path - A path of the directory.
   * @returns A promise that resolves when the directory exists.
   */
  ensureDir(path: string): Promise<void>;
}
