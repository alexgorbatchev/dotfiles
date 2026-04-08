import type { IFileSystem } from "./IFileSystem";

export const resolvedFileSystemBrand = Symbol("resolvedFileSystemBrand");
export type ResolvedFileSystemBrand = typeof resolvedFileSystemBrand;

/**
 * A branded file system interface that automatically expands home directory paths (`~`).
 *
 * This interface wraps an `IFileSystem` and intercepts all path arguments to expand `~` to the
 * configured home directory (`projectConfig.paths.homeDir` or `os.homedir()` by default)
 * before delegating to the underlying file system. The brand ensures compile-time safety by
 * distinguishing file systems that perform this expansion from those that don't, preventing
 * accidental use of unexpanded paths in operations that expect them.
 *
 * @see ResolvedFileSystem - The decorator class that implements this interface.
 */
export interface IResolvedFileSystem extends IFileSystem {
  readonly [resolvedFileSystemBrand]: true;
}
