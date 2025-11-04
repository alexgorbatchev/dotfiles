import type { ToolConfig } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { $ } from 'bun';
import type { BaseToolContext } from '../common/baseToolContext.types';
import type { SystemInfo } from '../common/common.types';
import type { ExtractResult } from './archive.types';

/**
 * Defines the context object passed to asynchronous TypeScript installation hooks.
 *
 * This context provides hooks with essential information about the current tool,
 * installation paths, system details, and results from previous steps (like
 * download or extraction). Hooks can use this information to perform custom
 * setup or modification tasks.
 *
 * For running shell commands within hooks, use Bun's built-in `$` shell operator.
 *
 * @public
 */
export interface InstallHookContext extends BaseToolContext {
  /**
   * The target directory where the tool's primary binary or executable should
   * be (or has been) installed.
   */
  installDir: string;

  /**
   * The path to the downloaded file or archive.
   * This is available in `afterDownload`, `afterExtract`, and `afterInstall` hooks.
   */
  downloadPath?: string;

  /**
   * The path to the directory where an archive's contents were extracted.
   * This is available in `afterExtract` and `afterInstall` hooks if archive
   * extraction occurred.
   */
  extractDir?: string;

  /**
   * The result of the archive extraction process, including lists of extracted
   * files and executables.
   * This is available in `afterExtract` and `afterInstall` hooks if archive
   * extraction occurred.
   * @see {@link ExtractResult}
   */
  extractResult?: ExtractResult;

  /**
   * Information about the system on which the installation is occurring
   * (e.g., platform, architecture).
   * This is available in all hooks.
   * @see {@link SystemInfo}
   */
  systemInfo: SystemInfo;

  /**
   * Bun's shell executor for running shell commands.
   * Use the `$` tagged template literal to execute shell commands within hooks.
   * The working directory can be changed using `cd` commands or `process.chdir()`.
   */
  $: typeof $;
}

/**
 * An enhanced context for installation hooks that includes additional utilities.
 *
 * This extends the standard {@link InstallHookContext} with conveniences like a
 * file system instance. This is the actual context type that hooks receive
- * when executed.
 *
 * @public
 */
export interface EnhancedInstallHookContext extends InstallHookContext {
  /** An instance of the file system for performing file operations. */
  fileSystem: IFileSystem;
  /** The path to the installed binary. Available in the `afterInstall` hook. */
  binaryPath?: string;
  /** The version of the installed tool. Available in the `afterInstall` hook. */
  version?: string;
  /** The full tool configuration being processed. Available in all hooks. */
  toolConfig?: ToolConfig;
}

/**
 * The base installation context used internally by the installer.
 *
 * All fields are required, as they represent the minimum context available at
 * the start of the installation process. It extends {@link BaseToolContext} to
 * provide consistent path utilities and logging.
 *
 * @internal
 */
export interface BaseInstallContext extends BaseToolContext {
  /** The target directory where the tool's primary binary should be installed. */
  installDir: string;
  /** A timestamp for the current installation (e.g., `YYYY-MM-DD-HH-MM-SS`). */
  timestamp: string;
  /** System information for the installation environment. */
  systemInfo: SystemInfo;
  /** The full tool configuration being processed. */
  toolConfig: ToolConfig;
}

/**
 * The installation context available after the download phase.
 *
 * It extends {@link BaseInstallContext} with download-specific information.
 *
 * @internal
 */
export interface PostDownloadInstallContext extends BaseInstallContext {
  /** The path to the downloaded file or archive. */
  downloadPath: string;
}

/**
 * The installation context available after the extraction phase.
 *
 * It extends {@link PostDownloadInstallContext} with extraction-specific information.
 *
 * @internal
 */
export interface PostExtractInstallContext extends PostDownloadInstallContext {
  /** The path to the directory where the archive contents were extracted. */
  extractDir: string;
  /** The result of the archive extraction process. */
  extractResult: ExtractResult;
}

/**
 * The final installation context available after a successful installation.
 *
 * It extends {@link BaseInstallContext} with the final installation results.
 *
 * @internal
 */
export interface FinalInstallContext extends BaseInstallContext {
  /** The path to the installed binary. */
  binaryPath: string;
  /** The version of the installed tool. */
  version: string;
}

/**
 * Defines the signature for an asynchronous TypeScript installation hook function.
 *
 * These hooks allow for custom logic to be executed at various stages of the
 * tool installation process, providing a powerful way to customize behavior.
 *
 * @param context - The {@link EnhancedInstallHookContext} providing details about
 *                  the current installation state.
 * @returns A `Promise` that resolves when the hook's operations are complete.
 *
 * @example
 * ```typescript
 * // An example `afterExtract` hook to move a specific binary and set permissions.
 * import type { AsyncInstallHook } from '@dotfiles/core';
 * import { $ } from 'bun';
 * import path from 'path';
 *
 * const myHook: AsyncInstallHook = async (context) => {
 *   const { appConfig, extractDir, extractResult, toolName, logger } = context;
 *   const customPath = appConfig.paths.targetDir;
 *
 *   if (extractDir && extractResult?.executables.includes('my-binary')) {
 *     const sourcePath = path.join(extractDir, 'my-binary');
 *     const targetPath = path.join(customPath, toolName);
 *
 *     logger.info(`Moving binary from ${sourcePath} to ${targetPath}`);
 *     await $`mv ${sourcePath} ${targetPath}`;
 *     await $`chmod +x ${targetPath}`;
 *     logger.info(`Moved ${toolName} to user-configured path: ${targetPath}`);
 *   }
 * };
 * ```
 *
 * @public
 */
export type AsyncInstallHook = (context: EnhancedInstallHookContext) => Promise<void>;
