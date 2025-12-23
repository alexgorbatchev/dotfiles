import type { ToolConfig } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { IBaseToolContext } from '../common/baseToolContext.types';
import type { $extended } from '../shell/extendedShell.types';
import type { IExtractResult } from './archive.types';

/**
 * Phase 1: Installation Start
 * We now have the full ToolConfig and a target directory.
 * This context is available in the `before-install` hook.
 */
export interface IInstallBaseContext extends IBaseToolContext {
  /** The full tool configuration being processed. */
  toolConfig: ToolConfig;
  /** A timestamp for the current installation (e.g., `YYYY-MM-DD-HH-MM-SS`). */
  timestamp: string;
  /**
   * Bun's shell executor for running shell commands.
   * Use the `$` tagged template literal to execute shell commands within hooks.
   * The working directory can be changed using `cd` commands or `process.chdir()`.
   */
  $: $extended;
  /** An instance of the file system for performing file operations. */
  fileSystem: IFileSystem;
}

/**
 * Phase 1: Installation Start
 * This context is available in the `before-install` hook.
 */
export interface IInstallContext extends IInstallBaseContext {
  /**
   * UUID-based staging directory for this installation attempt.
   *
   * This directory is used for transient work during installation (download/extract/build).
   * It is unique per attempt and must not be treated as a stable location.
   *
   * The stable path exposed to tool configs is `currentDir` (a symlink updated after success).
   *
   * @example
   * `stagingDir === "${projectConfig.paths.binariesDir}/${toolName}/<uuid>"`
   */
  stagingDir: string;
}

/**
 * Phase 2: After Download
 * We have a file on disk.
 * This context is available in the `after-download` hook.
 */
export interface IDownloadContext extends IInstallContext {
  /** The path to the downloaded file or archive. */
  downloadPath: string;
}

/**
 * Phase 3: After Extraction
 * We have extracted files.
 * This context is available in the `after-extract` hook.
 */
export interface IExtractContext extends IDownloadContext {
  /** The path to the directory where the archive contents were extracted. */
  extractDir: string;
  /** The result of the archive extraction process. */
  extractResult: IExtractResult;
}

/**
 * Phase 4: After Install
 * This context is available in the `after-install` hook.
 *
 * The `after-install` hook runs only when installation succeeded.
 */
export interface IAfterInstallContext extends IInstallBaseContext {
  /**
   * The final installation directory.
   *
   * For managed installers, this is versioned when a version is known.
   * For externally managed installers (e.g., Homebrew), this is typically the tool's
   * managed directory under the tool root (e.g., `external`).
   *
   * `currentDir` is repointed to this directory after a successful install.
   *
   * @example
   * Managed: `installedDir === "${projectConfig.paths.binariesDir}/${toolName}/1.2.3"`
   *
   * @example
   * External: `installedDir === "${projectConfig.paths.binariesDir}/${toolName}/external"`
   */
  installedDir: string;

  /** Absolute paths to installed binaries (resolved against installedDir). */
  binaryPaths: string[];

  /** The path to the downloaded file or archive. */
  downloadPath?: string;
  /** The path to the directory where the archive contents were extracted. */
  extractDir?: string;
  /** The result of the archive extraction process. */
  extractResult?: IExtractResult;

  /** The path to the installed binary. */
  binaryPath?: string;
  /** The version of the installed tool. */
  version?: string;
}

/**
 * Defines the signature for an asynchronous TypeScript installation hook function.
 *
 * These hooks allow for custom logic to be executed at various stages of the
 * tool installation process, providing a powerful way to customize behavior.
 *
 * ### Type Safety Note: Using `never` for Heterogeneous Collections
 *
 * When storing hooks that expect different context types (e.g., `IDownloadContext` vs `IExtractContext`)
 * in a single collection, use `AsyncInstallHook<never>`.
 *
 * **Why `never` instead of `unknown`?**
 *
 * 1. **Constraint Satisfaction**: The generic `T` must extend `IInstallContext`. `unknown` does not
 *    satisfy this constraint, but `never` (the bottom type) extends everything, including `IInstallContext`.
 *
 * 2. **Contravariance**: Function arguments in TypeScript are contravariant.
 *    - A function expecting a specific context (e.g., `(ctx: IDownloadContext) => void`) **cannot** be assigned
 *      to a type expecting a base context (e.g., `(ctx: IInstallContext) => void`), because the caller might
 *      pass a base context that lacks required properties like `downloadPath`.
 *    - However, it **can** be assigned to `(ctx: never) => void`, because `never` is a subtype of `IDownloadContext`.
 *      This makes `AsyncInstallHook<never>` the supertype of all specific hook functions, acting as a
 *      "universal bucket" for storage while maintaining type safety constraints.
 *
 * @example
 * ```typescript
 * // The specific hook we want to store
 * const downloadHook: AsyncInstallHook<IDownloadContext> = async (ctx) => {
 *   console.log(ctx.downloadPath);
 * };
 *
 * // ❌ Option 1: Using the base type
 * // Fails because the hook expects 'downloadPath', but 'IInstallContext' doesn't have it.
 * const hooks1: AsyncInstallHook<IInstallContext>[] = [downloadHook];
 *
 * // ❌ Option 2: Using unknown
 * // Fails because 'unknown' doesn't satisfy 'extends IInstallContext'.
 * // Also fails contravariance: (IDownloadContext) => void is not assignable to (unknown) => void.
 * const hooks2: AsyncInstallHook<unknown>[] = [downloadHook];
 *
 * // ✅ Option 3: Using never
 * // Works! 'never' extends 'IInstallContext'.
 * // Contravariance allows assigning (IDownloadContext) => void to (never) => void.
 * const hooks3: AsyncInstallHook<never>[] = [downloadHook];
 * ```
 *
 * @param context - The context providing details about the current installation state.
 * @returns A `Promise` that resolves when the hook's operations are complete.
 */
export type AsyncInstallHook<T extends IInstallBaseContext = IInstallContext> = {
  bivarianceHack(context: T): Promise<void>;
}['bivarianceHack'];
