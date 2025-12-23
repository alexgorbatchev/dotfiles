import type { IFileSystem } from './IFileSystem';

const resolvedFileSystemBrand = Symbol('resolvedFileSystemBrand');
export type ResolvedFileSystemBrand = typeof resolvedFileSystemBrand;

export interface IResolvedFileSystem extends IFileSystem {
  readonly [resolvedFileSystemBrand]: true;
}

export { resolvedFileSystemBrand };
