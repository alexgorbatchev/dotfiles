import { type DirectoryJSON, Volume } from 'memfs';
import type { IFileSystem } from './IFileSystem';
export type { DirectoryJSON }; // Re-export DirectoryJSON

import type { Stats } from 'node:fs'; // memfs Stats is compatible

/**
 * In-memory implementation of the {@link IFileSystem} interface using `memfs`.
 *
 * This class provides a virtual file system that is useful for testing and
 * dry-run scenarios, allowing file operations to be performed without
 * affecting the actual file system.
 *
 * @example
 * ```typescript
 * import { MemFileSystem } from '@dotfiles/file-system';
 *
 * const fs = new MemFileSystem({
 *   '/home/user/file.txt': 'Hello, world!',
 * });
 *
 * const content = await fs.readFile('/home/user/file.txt');
 * console.log(content); // 'Hello, world!'
 * ```
 *
 * @see {@link createMemFileSystem}
 * @see {@link IFileSystem}
 * @see {@link NodeFileSystem}
 */
export class MemFileSystem implements IFileSystem {
  private vol: Volume;

  /**
   * Constructs a new `MemFileSystem` instance.
   * @param json - An optional directory structure to initialize the file system with.
   */
  constructor(json?: DirectoryJSON) {
    // Always create a new, clean volume instance.
    // If json is provided, then populate. Otherwise, it's an empty volume.
    this.vol = new Volume();
    if (json) {
      this.vol.fromJSON(json);
    }
  }

  /**
   * @inheritdoc IFileSystem.readFile
   */
  public async readFile(path: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
    // memfs vol.promises.readFile returns a string if encoding is provided, otherwise a Buffer.
    // Our IFileSystem interface expects a string.
    const content = await this.vol.promises.readFile(path, { encoding });
    return content.toString(); // Ensure it's treated as string, as per memfs behavior with encoding.
  }

  /**
   * @inheritdoc IFileSystem.readFileBuffer
   */
  public async readFileBuffer(path: string): Promise<Buffer> {
    // memfs vol.promises.readFile returns a Buffer when no encoding is provided
    const content = await this.vol.promises.readFile(path);
    return Buffer.from(content);
  }

  /**
   * @inheritdoc IFileSystem.writeFile
   */
  public async writeFile(
    path: string,
    content: string | NodeJS.ArrayBufferView,
    encoding: BufferEncoding = 'utf8',
  ): Promise<void> {
    // memfs.promises.writeFile expects Buffer or string.
    // If content is ArrayBufferView but not Buffer, convert.
    const data = typeof content === 'string'
      ? content
      : Buffer.isBuffer(content)
      ? content
      : Buffer.from(content.buffer, content.byteOffset, content.byteLength);

    // The 'encoding' option in memfs.promises.writeFile applies when 'data' is a string.
    // If 'data' is a Buffer, the encoding option is ignored.
    await this.vol.promises.writeFile(path, data, { encoding });
  }

  /**
   * @inheritdoc IFileSystem.exists
   *
   * Uses stat() instead of access() to match Node.js behavior with broken symlinks.
   * Node.js access() fails with ENOENT for broken symlinks because it follows the symlink.
   * memfs access() incorrectly succeeds for broken symlinks, so we use stat() which
   * properly follows symlinks and fails if the target doesn't exist.
   */
  public async exists(path: string): Promise<boolean> {
    try {
      await this.vol.promises.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * @inheritdoc IFileSystem.mkdir
   */
  public async mkdir(path: string, options?: { recursive?: boolean; }): Promise<void> {
    await this.vol.promises.mkdir(path, options);
  }

  /**
   * @inheritdoc IFileSystem.readdir
   */
  public async readdir(path: string): Promise<string[]> {
    // memfs.promises.readdir returns string[] | Buffer[] | Dirent[]
    // IFileSystem expects string[], so we map and convert to string.
    const entries = await this.vol.promises.readdir(path);
    return entries.map((entry) => entry.toString());
  }

  /**
   * @inheritdoc IFileSystem.rm
   */
  public async rm(path: string, options?: { recursive?: boolean; force?: boolean; }): Promise<void> {
    // memfs.promises.rm handles both files and directories.
    // The `force` option in memfs.promises.rm will suppress ENOENT errors.
    // The `recursive` option is needed for directories.

    // WORKAROUND: memfs has a bug where rm() doesn't properly remove symlinks before creating new ones.
    // Check if the target is a symlink and use unlink() instead.
    try {
      const stats = await this.vol.promises.lstat(path);
      if (stats.isSymbolicLink()) {
        await this.vol.promises.unlink(path);
        return;
      }
    } catch (e: unknown) {
      const error = e as NodeJS.ErrnoException;
      if (options?.force && error?.code === 'ENOENT') {
        return;
      }
      // If lstat fails for another reason, fall through to regular rm() which will handle it
    }

    try {
      await this.vol.promises.rm(path, options);
    } catch (e: unknown) {
      // If force is true and error is ENOENT, suppress it. Otherwise, rethrow.
      const error = e as NodeJS.ErrnoException;
      if (options?.force && error?.code === 'ENOENT') {
        return;
      }
      throw e;
    }
  }

  /**
   * @inheritdoc IFileSystem.rmdir
   */
  public async rmdir(path: string, options?: { recursive?: boolean; }): Promise<void> {
    await this.vol.promises.rmdir(path, options);
  }

  /**
   * @inheritdoc IFileSystem.stat
   */
  public async stat(path: string): Promise<Stats> {
    // memfs.promises.stat returns a Promise<Stats>.
    // The Stats object from memfs is generally compatible with node:fs Stats.
    // vol.promises.stat on a link path returns stats of the target (like Node's fs.stat).
    // For link's own stats, lstat should be used.
    const stats = await this.vol.promises.stat(path);
    return stats as Stats; // Cast to Node's Stats type for interface compatibility
  }

  /**
   * @inheritdoc IFileSystem.lstat
   */
  public async lstat(path: string): Promise<Stats> {
    // memfs.promises.lstat returns a Promise<Stats> for the link itself.
    const stats = await this.vol.promises.lstat(path);
    return stats as Stats; // Cast to Node's Stats type
  }

  /**
   * @inheritdoc IFileSystem.symlink
   */
  public async symlink(
    target: string,
    path: string,
    type?: 'file' | 'dir' | 'junction', // memfs.promises.symlink also accepts type, behavior might vary.
  ): Promise<void> {
    // memfs.promises.symlink type argument might be handled differently than node:fs.
    // We pass it along; memfs typically infers if not strictly 'file'/'dir'.
    await this.vol.promises.symlink(target, path, type);
  }

  /**
   * @inheritdoc IFileSystem.readlink
   */
  public async readlink(path: string): Promise<string> {
    // memfs.promises.readlink returns a Promise<string | Buffer>.
    // IFileSystem expects Promise<string>.
    const linkString = await this.vol.promises.readlink(path);
    return linkString.toString();
  }

  /**
   * @inheritdoc IFileSystem.chmod
   */
  public async chmod(path: string, mode: number | string): Promise<void> {
    await this.vol.promises.chmod(path, typeof mode === 'string' ? parseInt(mode, 8) : mode);
  }

  /**
   * @inheritdoc IFileSystem.copyFile
   */
  public async copyFile(src: string, dest: string, flags?: number): Promise<void> {
    // memfs.promises.copyFile is available and preferred.
    // The `flags` argument is part of the Node.js fs.copyFile signature,
    // memfs.promises.copyFile also accepts it.
    await this.vol.promises.copyFile(src, dest, flags);
  }

  /**
   * @inheritdoc IFileSystem.rename
   */
  public async rename(oldPath: string, newPath: string): Promise<void> {
    await this.vol.promises.rename(oldPath, newPath);
  }

  /**
   * @inheritdoc IFileSystem.ensureDir
   */
  public async ensureDir(path: string): Promise<void> {
    // ensureDir is equivalent to mkdir with recursive: true.
    // memfs.promises.mkdir will not throw if the directory already exists when recursive is true.
    await this.vol.promises.mkdir(path, { recursive: true });
  }

  /**
   * Returns the underlying `memfs` volume instance.
   *
   * This method is intended for testing purposes, allowing direct manipulation
   * and inspection of the in-memory file system.
   *
   * @returns The `Volume` instance.
   *
   * @internal
   */
  public getVolume(): Volume {
    return this.vol;
  }
}
