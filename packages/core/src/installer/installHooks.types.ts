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
export interface IInstallContext extends IBaseToolContext {
  /** The full tool configuration being processed. */
  toolConfig: ToolConfig;
  /** The target directory where the tool's primary binary should be installed. */
  installDir: string;
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
 * Back to optionals because we don't know how we got here.
 * This context is available in the `after-install` hook.
 */
export interface IAfterInstallContext extends IInstallContext {
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
export type AsyncInstallHook<T extends IInstallContext = IInstallContext> = (context: T) => Promise<void>;

// Type aliases for commonly used contexts
export type InstallContext = IInstallContext;
export type DownloadContext = IDownloadContext;
export type ExtractContext = IExtractContext;
export type AfterInstallContext = IAfterInstallContext;
