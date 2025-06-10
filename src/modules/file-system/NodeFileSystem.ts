/**
 * @file generator/src/modules/file-system/NodeFileSystem.ts
 * @description Concrete implementation of IFileSystem using Node.js's built-in 'fs' module.
 */

import { promises as fsPromises, constants as fsConstants } from 'node:fs';
import type { Stats } from 'node:fs';
import type { IFileSystem } from './IFileSystem';

export class NodeFileSystem implements IFileSystem {
  public async readFile(path: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
    return fsPromises.readFile(path, { encoding });
  }

  public async writeFile(
    path: string,
    content: string | NodeJS.ArrayBufferView,
    encoding: BufferEncoding = 'utf8'
  ): Promise<void> {
    return fsPromises.writeFile(path, content, { encoding });
  }

  public async exists(path: string): Promise<boolean> {
    try {
      await fsPromises.access(path, fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  public async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    await fsPromises.mkdir(path, options);
  }

  public async readdir(path: string): Promise<string[]> {
    return fsPromises.readdir(path);
  }

  public async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    return fsPromises.rm(path, options);
  }

  public async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    return fsPromises.rmdir(path, options);
  }

  public async stat(path: string): Promise<Stats> {
    return fsPromises.stat(path);
  }

  public async lstat(path: string): Promise<Stats> {
    return fsPromises.lstat(path);
  }

  public async symlink(
    target: string,
    path: string,
    type?: 'file' | 'dir' | 'junction'
  ): Promise<void> {
    return fsPromises.symlink(target, path, type);
  }

  public async readlink(path: string): Promise<string> {
    return fsPromises.readlink(path);
  }

  public async chmod(path: string, mode: number | string): Promise<void> {
    return fsPromises.chmod(path, mode);
  }

  public async copyFile(src: string, dest: string, flags?: number): Promise<void> {
    return fsPromises.copyFile(src, dest, flags);
  }

  public async rename(oldPath: string, newPath: string): Promise<void> {
    return fsPromises.rename(oldPath, newPath);
  }

  public async ensureDir(path: string): Promise<void> {
    // fsPromises.mkdir with recursive: true already behaves like ensureDir
    // It doesn't throw an error if the directory already exists.
    await fsPromises.mkdir(path, { recursive: true });
  }
}
