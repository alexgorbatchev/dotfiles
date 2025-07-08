/**
 * @file generator/src/modules/file-system/MemFileSystem.ts
 * @description In-memory implementation of IFileSystem using memfs.
 *
 * ## Development Plan
 *
 * ### Phase 1: Initial Synchronous Implementation (Completed)
 * - [x] Implement all `IFileSystem` methods using synchronous `memfs` calls.
 * - [x] Ensure constructor initializes `Volume` correctly (empty or from JSON).
 * - [x] Write initial unit tests for synchronous methods.
 * - [x] Cleanup linting errors.
 * - [x] Achieve initial 100% test coverage.
 *
 * ### Phase 2: Asynchronous Refactoring (In Progress)
 * - [ ] Refactor methods to use asynchronous `this.vol.promises` where applicable:
 *   - [x] `readFile`
 *   - [x] `writeFile`
 *   - [x] `exists`
 *   - [x] `mkdir`
 *   - [x] `readdir`
 *   - [x] `rm`
 *   - [x] `rmdir`
 *   - [x] `stat`
 *   - [x] `symlink`
 *   - [x] `readlink`
 *   - [x] `chmod`
 *   - [x] `copyFile`
 *   - [x] `rename`
 *   - [x] `ensureDir`
 * - [x] Update corresponding unit tests for asynchronous behavior. (Verified tests already async)
 * - [x] Ensure all project tests pass after each method refactor.
 * - [ ] Maintain 100% test coverage.
 *
 * ### Phase 3: Finalization
 * - [ ] Write/enhance comprehensive unit tests for all methods, covering edge cases (after async refactor).
 * - [ ] Final cleanup of linting errors.
 * - [ ] Final verification of 100% test coverage.
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

import type { IFileSystem } from './IFileSystem';
import { Volume, type DirectoryJSON } from 'memfs';
export type { DirectoryJSON }; // Re-export DirectoryJSON
import type { Stats } from 'node:fs'; // memfs Stats is compatible

// Helper to convert Buffer to string if encoding is provided // No longer needed after async refactor
// function bufferToString(buffer: Buffer, encoding?: BufferEncoding): string {
//   return buffer.toString(encoding || 'utf8');
// }

/**
 * In-memory implementation of the `IFileSystem` interface using `memfs`.
 *
 * This class provides a virtual file system that is useful for testing and
 * dry-run scenarios, allowing file operations to be performed without
 * affecting the actual file system.
 *
 * @testing
 * For unit and integration tests, two primary helpers are available:
 * - `createMemFileSystem`: A simple factory to create an instance of this
 *   class, optionally seeding it with an initial directory structure.
 *   (from `src/testing-helpers/createMemFileSystem.ts`)
 * - `createMockFileSystem`: A more advanced factory that creates a fully
 *   mocked `IFileSystem` instance with spies for each method, allowing for
 *   fine-grained control over the mock's behavior.
 *   (from `src/testing-helpers/createMockFileSystem.ts`)
 */
export class MemFileSystem implements IFileSystem {
  private vol: Volume;

  constructor(json?: DirectoryJSON) {
    // Always create a new, clean volume instance.
    // If json is provided, then populate. Otherwise, it's an empty volume.
    this.vol = new Volume();
    if (json) {
      this.vol.fromJSON(json);
    }
  }

  public async readFile(path: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
    // memfs vol.promises.readFile returns a string if encoding is provided, otherwise a Buffer.
    // Our IFileSystem interface expects a string.
    const content = await this.vol.promises.readFile(path, { encoding });
    return content as string; // Ensure it's treated as string, as per memfs behavior with encoding.
  }

  public async writeFile(
    path: string,
    content: string | NodeJS.ArrayBufferView,
    encoding: BufferEncoding = 'utf8'
  ): Promise<void> {
    // memfs.promises.writeFile expects Buffer or string.
    // If content is ArrayBufferView but not Buffer, convert.
    const data =
      typeof content === 'string'
        ? content
        : Buffer.isBuffer(content)
          ? content
          : Buffer.from(content.buffer, content.byteOffset, content.byteLength);

    // The 'encoding' option in memfs.promises.writeFile applies when 'data' is a string.
    // If 'data' is a Buffer, the encoding option is ignored.
    await this.vol.promises.writeFile(path, data, { encoding });
  }

  public async exists(path: string): Promise<boolean> {
    try {
      await this.vol.promises.access(path);
      return true;
    } catch (e) {
      // memfs throws an error if path does not exist, similar to Node's fs.promises.access
      return false;
    }
  }

  public async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await this.vol.promises.mkdir(path, options);
  }

  public async readdir(path: string): Promise<string[]> {
    // memfs.promises.readdir returns string[] | Buffer[] | Dirent[]
    // IFileSystem expects string[], so we map and convert to string.
    const entries = await this.vol.promises.readdir(path);
    return entries.map((entry) => entry.toString());
  }

  public async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    // memfs.promises.rm handles both files and directories.
    // The `force` option in memfs.promises.rm will suppress ENOENT errors.
    // The `recursive` option is needed for directories.
    try {
      await this.vol.promises.rm(path, options);
    } catch (e: any) {
      // If force is true and error is ENOENT, suppress it. Otherwise, rethrow.
      if (options?.force && e?.code === 'ENOENT') {
        return;
      }
      throw e;
    }
  }

  public async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await this.vol.promises.rmdir(path, options);
  }

  public async stat(path: string): Promise<Stats> {
    // memfs.promises.stat returns a Promise<Stats>.
    // The Stats object from memfs is generally compatible with node:fs Stats.
    // vol.promises.stat on a link path returns stats of the target (like Node's fs.stat).
    // For link's own stats, lstat should be used.
    const stats = await this.vol.promises.stat(path);
    return stats as Stats; // Cast to Node's Stats type for interface compatibility
  }

  public async lstat(path: string): Promise<Stats> {
    // memfs.promises.lstat returns a Promise<Stats> for the link itself.
    const stats = await this.vol.promises.lstat(path);
    return stats as Stats; // Cast to Node's Stats type
  }

  public async symlink(
    target: string,
    path: string,
    type?: 'file' | 'dir' | 'junction' // memfs.promises.symlink also accepts type, behavior might vary.
  ): Promise<void> {
    // memfs.promises.symlink type argument might be handled differently than node:fs.
    // We pass it along; memfs typically infers if not strictly 'file'/'dir'.
    await this.vol.promises.symlink(target, path, type);
  }

  public async readlink(path: string): Promise<string> {
    // memfs.promises.readlink returns a Promise<string | Buffer>.
    // IFileSystem expects Promise<string>.
    const linkString = await this.vol.promises.readlink(path);
    return linkString.toString();
  }

  public async chmod(path: string, mode: number | string): Promise<void> {
    await this.vol.promises.chmod(path, typeof mode === 'string' ? parseInt(mode, 8) : mode);
  }

  public async copyFile(src: string, dest: string, flags?: number): Promise<void> {
    // memfs.promises.copyFile is available and preferred.
    // The `flags` argument is part of the Node.js fs.copyFile signature,
    // memfs.promises.copyFile also accepts it.
    await this.vol.promises.copyFile(src, dest, flags);
  }

  public async rename(oldPath: string, newPath: string): Promise<void> {
    await this.vol.promises.rename(oldPath, newPath);
  }

  public async ensureDir(path: string): Promise<void> {
    // ensureDir is equivalent to mkdir with recursive: true.
    // memfs.promises.mkdir will not throw if the directory already exists when recursive is true.
    await this.vol.promises.mkdir(path, { recursive: true });
  }

  // Utility to get the underlying volume for testing or direct manipulation if needed
  public getVolume(): Volume {
    return this.vol;
  }
}
