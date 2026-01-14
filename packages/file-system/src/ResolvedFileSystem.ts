import { expandHomePath } from '@dotfiles/utils';
import type { IFileSystem, NodeStats } from './IFileSystem';
import type { IResolvedFileSystem } from './IResolvedFileSystem';
import { resolvedFileSystemBrand } from './IResolvedFileSystem';

export class ResolvedFileSystem implements IResolvedFileSystem {
  public readonly [resolvedFileSystemBrand]: true;

  private readonly inner: IFileSystem;
  private readonly homeDir: string;

  public constructor(inner: IFileSystem, homeDir: string) {
    this.inner = inner;
    this.homeDir = homeDir;
    this[resolvedFileSystemBrand] = true;
  }

  public async readFile(filePath: string, encoding?: BufferEncoding): Promise<string> {
    return this.inner.readFile(expandHomePath(this.homeDir, filePath), encoding);
  }

  public async readFileBuffer(filePath: string): Promise<Buffer> {
    return this.inner.readFileBuffer(expandHomePath(this.homeDir, filePath));
  }

  public async writeFile(
    filePath: string,
    content: string | NodeJS.ArrayBufferView,
    encoding?: BufferEncoding,
  ): Promise<void> {
    await this.inner.writeFile(expandHomePath(this.homeDir, filePath), content, encoding);
  }

  public async exists(filePath: string): Promise<boolean> {
    return this.inner.exists(expandHomePath(this.homeDir, filePath));
  }

  public async mkdir(dirPath: string, options?: { recursive?: boolean; }): Promise<void> {
    await this.inner.mkdir(expandHomePath(this.homeDir, dirPath), options);
  }

  public async readdir(dirPath: string): Promise<string[]> {
    return this.inner.readdir(expandHomePath(this.homeDir, dirPath));
  }

  public async rm(filePath: string, options?: { recursive?: boolean; force?: boolean; }): Promise<void> {
    await this.inner.rm(expandHomePath(this.homeDir, filePath), options);
  }

  public async rmdir(dirPath: string, options?: { recursive?: boolean; }): Promise<void> {
    await this.inner.rmdir(expandHomePath(this.homeDir, dirPath), options);
  }

  public async stat(filePath: string): Promise<NodeStats> {
    return this.inner.stat(expandHomePath(this.homeDir, filePath));
  }

  public async lstat(filePath: string): Promise<NodeStats> {
    return this.inner.lstat(expandHomePath(this.homeDir, filePath));
  }

  public async symlink(target: string, linkPath: string, type?: 'file' | 'dir' | 'junction'): Promise<void> {
    await this.inner.symlink(expandHomePath(this.homeDir, target), expandHomePath(this.homeDir, linkPath), type);
  }

  public async readlink(linkPath: string): Promise<string> {
    return this.inner.readlink(expandHomePath(this.homeDir, linkPath));
  }

  public async chmod(filePath: string, mode: number | string): Promise<void> {
    await this.inner.chmod(expandHomePath(this.homeDir, filePath), mode);
  }

  public async copyFile(src: string, dest: string, flags?: number): Promise<void> {
    await this.inner.copyFile(expandHomePath(this.homeDir, src), expandHomePath(this.homeDir, dest), flags);
  }

  public async rename(oldPath: string, newPath: string): Promise<void> {
    await this.inner.rename(expandHomePath(this.homeDir, oldPath), expandHomePath(this.homeDir, newPath));
  }

  public async ensureDir(dirPath: string): Promise<void> {
    await this.inner.ensureDir(expandHomePath(this.homeDir, dirPath));
  }
}
