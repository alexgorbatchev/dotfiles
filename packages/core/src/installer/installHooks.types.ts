import type { ToolConfig } from "@dotfiles/core";
import type { IFileSystem } from "@dotfiles/file-system";
import type { IBaseToolContext } from "../common/baseToolContext.types";
import type { ProjectConfig } from "../config";
import type { IShell } from "../shell/types";
import type { IExtractResult } from "./archive.types";

/**
 * Context provided to dynamic env functions for environment variable generation.
 * This is the base context available to all installers.
 */
export interface IEnvContext {
  /** Project configuration with paths and settings */
  projectConfig: ProjectConfig;

  /**
   * The absolute path to the temporary staging directory for this installation attempt.
   * After successful installation, the entire directory is renamed to the versioned path.
   */
  stagingDir: string;
}

/**
 * Phase 1: Installation Start
 * We now have the full ToolConfig and a target directory.
 * This context is available in the `before-install` hook.
 */
export interface IInstallBaseContext extends IBaseToolContext {
  /**
   * The full tool configuration being processed.
   *
   * This is the resolved `ToolConfig` for the current tool, including any platform-specific overrides.
   */
  toolConfig: ToolConfig;

  /**
   * A timestamp for the current installation attempt.
   *
   * Used as a stable identifier for this run and as a fallback version label when a version
   * cannot be resolved.
   *
   * @example
   * `timestamp === "2025-12-23-09-41-12"`
   */
  timestamp: string;

  /**
   * Bun's shell executor for running shell commands that inherit the current environment.
   *
   * Use the `$` tagged template literal to execute shell commands within hooks.
   * The working directory can be changed using `cd` commands or `process.chdir()`.
   */
  $: IShell;

  /**
   * An instance of the file system for performing file operations.
   */
  fileSystem: IFileSystem;

  /**
   * The installation environment variables.
   *
   * This includes the recursion guard and modified PATH for the current installation.
   * Used internally by HookExecutor to create shells with output streaming while
   * preserving the installation environment.
   */
  installEnv?: Record<string, string | undefined>;
}

/**
 * Phase 1: Installation Start
 * This context is available in the `before-install` hook.
 */
export interface IInstallContext extends IInstallBaseContext {
  /**
   * Per-attempt staging directory for this installation attempt.
   *
   * This is a transient workspace for download/extract/build steps and may be removed or renamed
   * after installation. Do not persist references to this directory.
   *
   * For successful managed installs, this directory is typically renamed to `installedDir`.
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
  /**
   * The path to the downloaded file or archive.
   *
   * This is the on-disk artifact produced by the download step (e.g., a `.tar.gz`, `.zip`, or
   * standalone binary) stored under the current `stagingDir`.
   *
   * @example
   * `downloadPath === "${stagingDir}/downloads/tool.tar.gz"`
   */
  downloadPath: string;
}

/**
 * Phase 3: After Extraction
 * We have extracted files.
 * This context is available in the `after-extract` hook.
 */
export interface IExtractContext extends IDownloadContext {
  /**
   * The path to the directory where the archive contents were extracted.
   *
   * This is a transient directory under `stagingDir` containing the extracted payload.
   * Hooks commonly move binaries out of this directory into a stable layout under `stagingDir`
   * before the installer finalizes the installation.
   *
   * @example
   * `extractDir === "${stagingDir}/extracted"`
   */
  extractDir: string;

  /**
   * The result of the archive extraction process.
   *
   * Contains extraction metadata such as which files were extracted.
   */
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

  /**
   * Absolute paths to installed binaries.
   *
   * These paths point at the *real* installed executables for this successful install.
   * For multi-binary tools, this can include multiple entries.
   *
   * If you need a single “primary” binary, use `binaryPaths[0]`.
   *
   * @example
   * Single binary: `binaryPaths === ["${installedDir}/rg"]`
   *
   * @example
   * Multi-binary: `binaryPaths === ["${installedDir}/node", "${installedDir}/npm", "${installedDir}/npx"]`
   */
  binaryPaths: string[];

  /**
   * The version of the installed tool.
   *
   * This is populated when the installer can determine a version (e.g., from a release tag
   * or an installer-specific version source). For externally managed installers, or when
   * the version cannot be resolved, this may be `undefined`.
   *
   * @example
   * `version === "1.2.3"`
   */
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
}["bivarianceHack"];
