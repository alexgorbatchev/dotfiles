import type { Stats } from 'node:fs';
import { constants as fsConstants, promises as fsPromises } from 'node:fs';
import type { IFileSystem } from './IFileSystem';

type FsPromises = typeof fsPromises;

export class NodeFileSystem implements IFileSystem {
  private readonly fs: FsPromises;
  private readonly constants: typeof fsConstants;

  constructor(fs: FsPromises = fsPromises, constants: typeof fsConstants = fsConstants) {
    this.fs = fs;
    this.constants = constants;
  }

  public async readFile(path: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
    return this.fs.readFile(path, { encoding });
  }

  public async readFileBuffer(path: string): Promise<Buffer> {
    return this.fs.readFile(path);
  }

  public async writeFile(
    path: string,
    content: string | NodeJS.ArrayBufferView,
    encoding: BufferEncoding = 'utf8'
  ): Promise<void> {
    return this.fs.writeFile(path, content, { encoding });
  }

  public async exists(path: string): Promise<boolean> {
    try {
      await this.fs.access(path, this.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  public async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await this.fs.mkdir(path, options);
  }

  public async readdir(path: string): Promise<string[]> {
    return this.fs.readdir(path);
  }

  public async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    return this.fs.rm(path, options);
  }

  public async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    return this.fs.rmdir(path, options);
  }

  public async stat(path: string): Promise<Stats> {
    return this.fs.stat(path);
  }

  public async lstat(path: string): Promise<Stats> {
    return this.fs.lstat(path);
  }

  public async symlink(target: string, path: string, type?: 'file' | 'dir' | 'junction'): Promise<void> {
    return this.fs.symlink(target, path, type);
  }

  public async readlink(path: string): Promise<string> {
    return this.fs.readlink(path);
  }

  public async chmod(path: string, mode: number | string): Promise<void> {
    return this.fs.chmod(path, mode);
  }

  public async copyFile(src: string, dest: string, flags?: number): Promise<void> {
    return this.fs.copyFile(src, dest, flags);
  }

  public async rename(oldPath: string, newPath: string): Promise<void> {
    return this.fs.rename(oldPath, newPath);
  }

  public async ensureDir(path: string): Promise<void> {
    // this.fs.mkdir with recursive: true already behaves like ensureDir
    // It doesn't throw an error if the directory already exists.
    await this.fs.mkdir(path, { recursive: true });
  }
}
