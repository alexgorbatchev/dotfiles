/**
 * @file generator/src/modules/file-system/MemFileSystem.ts
 * @description In-memory implementation of IFileSystem using memfs.
 */

import type { IFileSystem } from './IFileSystem';
import { Volume, type DirectoryJSON } from 'memfs';
import type { Stats } from 'node:fs'; // memfs Stats is compatible

// Helper to convert Buffer to string if encoding is provided
function bufferToString(buffer: Buffer, encoding?: BufferEncoding): string {
  return buffer.toString(encoding || 'utf8');
}

export class MemFileSystem implements IFileSystem {
  private vol: Volume;

  constructor(json?: DirectoryJSON) {
    this.vol = Volume.fromJSON(json || {});
  }

  public async readFile(path: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
    const content = this.vol.readFileSync(path);
    if (Buffer.isBuffer(content)) {
      return bufferToString(content, encoding);
    }
    // Should not happen with readFileSync if not specifying encoding to it, but good practice
    return String(content);
  }

  public async writeFile(
    path: string,
    content: string | NodeJS.ArrayBufferView,
    encoding: BufferEncoding = 'utf8'
  ): Promise<void> {
    // memfs.writeFileSync expects Buffer or string. If content is ArrayBufferView but not Buffer, convert.
    // However, typical ArrayBufferViews like Uint8Array are accepted by Buffer.from().
    const bufferOrString =
      typeof content === 'string'
        ? content
        : Buffer.from(content.buffer, content.byteOffset, content.byteLength);
    this.vol.writeFileSync(path, bufferOrString, { encoding });
  }

  public async exists(path: string): Promise<boolean> {
    return this.vol.existsSync(path);
  }

  public async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    this.vol.mkdirSync(path, options);
  }

  public async readdir(path: string): Promise<string[]> {
    // memfs.readdirSync returns string[] | Buffer[] | Dirent[]
    // We need to ensure it's string[] to match IFileSystem
    const entries = this.vol.readdirSync(path);
    return entries.map((entry) => entry.toString());
  }

  public async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    // memfs rmSync is available from memfs v4.x
    // For older versions, or to be safe, check type and use rmdirSync/unlinkSync
    const stat = this.vol.statSync(path, { throwIfNoEntry: false });
    if (!stat) {
      if (options?.force) return; // If force and no entry, do nothing
      throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
    }

    if (stat.isDirectory()) {
      this.vol.rmdirSync(path, { recursive: options?.recursive });
    } else {
      this.vol.unlinkSync(path);
    }
  }

  public async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    this.vol.rmdirSync(path, options);
  }

  public async stat(path: string): Promise<Stats> {
    // Keep Promise<Stats> for interface compliance
    // memfs Stats object is compatible with node:fs Stats in terms of properties,
    // but method behavior like isSymbolicLink() might depend on the actual instance.
    // vol.statSync on a link path returns stats of the link (like lstat).
    const stats = this.vol.statSync(path);
    return stats as Stats; // Cast to Node's Stats type for interface compatibility
  }

  public async symlink(
    target: string,
    path: string,
    _type?: 'file' | 'dir' | 'junction' // Prefixed with underscore as it's not used by memfs.symlinkSync
  ): Promise<void> {
    // memfs type argument is different from node:fs, it's usually inferred or not needed for basic symlinks.
    // For simplicity, we'll assume 'file' or let memfs infer.
    this.vol.symlinkSync(target, path);
  }

  public async readlink(path: string): Promise<string> {
    return this.vol.readlinkSync(path).toString();
  }

  public async chmod(path: string, mode: number | string): Promise<void> {
    this.vol.chmodSync(path, typeof mode === 'string' ? parseInt(mode, 8) : mode);
  }

  public async copyFile(src: string, dest: string, _flags?: number): Promise<void> {
    // Prefixed flags
    // memfs doesn't have a direct copyFileSync like node:fs/promises.
    // We need to read and write.
    const content = this.vol.readFileSync(src);
    this.vol.writeFileSync(dest, content);
  }

  public async rename(oldPath: string, newPath: string): Promise<void> {
    this.vol.renameSync(oldPath, newPath);
  }

  public async ensureDir(path: string): Promise<void> {
    this.vol.mkdirSync(path, { recursive: true });
  }

  // Utility to get the underlying volume for testing or direct manipulation if needed
  public getVolume(): Volume {
    return this.vol;
  }
}
