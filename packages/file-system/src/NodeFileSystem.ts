import type { Stats } from "node:fs";
import { constants as fsConstants, promises as fsPromises } from "node:fs";
import type { IFileSystem } from "./IFileSystem";
import type { FileMode, FileWriteContent, IRecursiveDirectoryOptions, IRemoveOptions, SymlinkKind } from "./types";

type FsPromises = typeof fsPromises;

/**
 * A concrete implementation of the {@link IFileSystem} interface that uses the
 * Node.js `fs` module.
 *
 * This class is a thin wrapper around `fs.promises`, providing an
 * object-oriented and testable way to interact with the file system.
 *
 * @example
 * ```typescript
 * import { NodeFileSystem } from '@dotfiles/file-system';
 *
 * const fs = new NodeFileSystem();
 *
 * async function main() {
 *   await fs.writeFile('hello.txt', 'Hello, world!');
 *   const content = await fs.readFile('hello.txt');
 *   console.log(content); // 'Hello, world!'
 *   await fs.rm('hello.txt');
 * }
 *
 * main();
 * ```
 *
 * @see {@link IFileSystem}
 * @see {@link MemFileSystem}
 */
export class NodeFileSystem implements IFileSystem {
  private readonly fs: FsPromises;
  private readonly constants: typeof fsConstants;

  /**
   * Constructs a new `NodeFileSystem` instance.
   * @param fs - An optional `fs.promises` compatible object.
   * @param constants - An optional `fs.constants` compatible object.
   *
   * @internal
   */
  constructor(fs: FsPromises = fsPromises, constants: typeof fsConstants = fsConstants) {
    this.fs = fs;
    this.constants = constants;
  }

  /**
   * @inheritdoc IFileSystem.readFile
   */
  public async readFile(path: string, encoding: BufferEncoding = "utf8"): Promise<string> {
    return this.fs.readFile(path, { encoding });
  }

  /**
   * @inheritdoc IFileSystem.readFileBuffer
   */
  public async readFileBuffer(path: string): Promise<Buffer> {
    return this.fs.readFile(path);
  }

  /**
   * @inheritdoc IFileSystem.writeFile
   */
  public async writeFile(path: string, content: FileWriteContent, encoding: BufferEncoding = "utf8"): Promise<void> {
    return this.fs.writeFile(path, content, { encoding });
  }

  /**
   * @inheritdoc IFileSystem.exists
   */
  public async exists(path: string): Promise<boolean> {
    try {
      await this.fs.access(path, this.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * @inheritdoc IFileSystem.mkdir
   */
  public async mkdir(path: string, options?: IRecursiveDirectoryOptions): Promise<void> {
    await this.fs.mkdir(path, options);
  }

  /**
   * @inheritdoc IFileSystem.readdir
   */
  public async readdir(path: string): Promise<string[]> {
    return this.fs.readdir(path);
  }

  /**
   * @inheritdoc IFileSystem.rm
   */
  public async rm(path: string, options?: IRemoveOptions): Promise<void> {
    return this.fs.rm(path, options);
  }

  /**
   * @inheritdoc IFileSystem.rmdir
   */
  public async rmdir(path: string, options?: IRecursiveDirectoryOptions): Promise<void> {
    if (options?.recursive) {
      return this.fs.rm(path, { recursive: true, force: true });
    }
    return this.fs.rmdir(path);
  }

  /**
   * @inheritdoc IFileSystem.stat
   */
  public async stat(path: string): Promise<Stats> {
    return this.fs.stat(path);
  }

  /**
   * @inheritdoc IFileSystem.lstat
   */
  public async lstat(path: string): Promise<Stats> {
    return this.fs.lstat(path);
  }

  /**
   * @inheritdoc IFileSystem.symlink
   */
  public async symlink(target: string, path: string, type?: SymlinkKind): Promise<void> {
    return this.fs.symlink(target, path, type);
  }

  /**
   * @inheritdoc IFileSystem.readlink
   */
  public async readlink(path: string): Promise<string> {
    return this.fs.readlink(path);
  }

  /**
   * @inheritdoc IFileSystem.chmod
   */
  public async chmod(path: string, mode: FileMode): Promise<void> {
    return this.fs.chmod(path, mode);
  }

  /**
   * @inheritdoc IFileSystem.copyFile
   */
  public async copyFile(src: string, dest: string, flags?: number): Promise<void> {
    return this.fs.copyFile(src, dest, flags);
  }

  /**
   * @inheritdoc IFileSystem.rename
   */
  public async rename(oldPath: string, newPath: string): Promise<void> {
    return this.fs.rename(oldPath, newPath);
  }

  /**
   * @inheritdoc IFileSystem.ensureDir
   */
  public async ensureDir(path: string): Promise<void> {
    // this.fs.mkdir with recursive: true already behaves like ensureDir
    // It doesn't throw an error if the directory already exists.
    await this.fs.mkdir(path, { recursive: true });
  }
}
