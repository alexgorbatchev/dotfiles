import type { YamlConfig } from '@modules/config';
import type { IFileSystem } from '@modules/file-system';
import type { TsLogger } from '@modules/logger';
import type { $ } from 'zx';
import type { ExtractResult } from './archive.types';
import type { SystemInfo } from './common.types';
import type { ToolConfig } from './tool-config';

/**
 * Defines the context object passed to asynchronous TypeScript installation hooks.  This context provides information
 * about the current tool, installation paths, system details, and results from previous steps (like download or
 * extraction).  Hooks can use this information to perform custom setup or modification tasks.
 *
 * It is recommended to use a library like `zx` (google/zx) within hooks for easily running shell commands and performing
 * file system operations.
 */
export interface InstallHookContext {
  /** The name of the tool currently being installed. */
  toolName: string;
  /** The target directory where the tool's primary binary/executable should be (or has been) installed. */
  installDir: string;
  /**
   * The path to the downloaded file or archive.
   * This is available in `afterDownload`, `afterExtract`, and `afterInstall` hooks.
   */
  downloadPath?: string;
  /**
   * The path to the directory where an archive's contents were extracted.
   * This is available in `afterExtract` and `afterInstall` hooks if archive extraction occurred.
   */
  extractDir?: string;
  /**
   * The result of the archive extraction process, including lists of extracted files and executables.
   * This is available in `afterExtract` and `afterInstall` hooks if archive extraction occurred.
   * @see ExtractResult
   */
  extractResult?: ExtractResult;
  /**
   * Information about the system on which the installation is occurring (platform, architecture).
   * This is available in all hooks.
   * @see SystemInfo
   */
  systemInfo?: SystemInfo;
  /**
   * ZX shell executor with cwd set to the directory of the .tool.ts file.
   * This allows hooks to run shell commands relative to the tool's configuration directory.
   */
  $: typeof $;
}

/**
 * Enhanced context for installation hooks with additional utilities.
 * This extends the standard InstallHookContext with extra development conveniences.
 * This is the actual context type that hooks receive when executed.
 */
export interface EnhancedInstallHookContext extends InstallHookContext {
  /** File system instance for performing file operations */
  fileSystem: IFileSystem;
  /** Logger instance for structured logging */
  logger: TsLogger;
  /** Binary path (available in afterInstall hook) */
  binaryPath?: string;
  /** Version of the installed tool (available in afterInstall hook) */
  version?: string;
  /** The user's application configuration (available in all hooks) */
  appConfig?: YamlConfig;
  /** The full tool configuration being processed (available in all hooks) */
  toolConfig?: ToolConfig;
}

/**
 * Base install context used internally by the installer.
 * All fields are required as they represent the minimum context available.
 */
export interface BaseInstallContext {
  /** The name of the tool currently being installed */
  toolName: string;
  /** The target directory where the tool's primary binary/executable should be installed */
  installDir: string;
  /** System information for the installation environment */
  systemInfo: SystemInfo;
  /** The full tool configuration being processed */
  toolConfig: ToolConfig;
  /** The user's application configuration (YAML config) */
  appConfig: YamlConfig;
}

/**
 * Install context after download phase.
 * Extends BaseInstallContext with download-specific information.
 */
export interface PostDownloadInstallContext extends BaseInstallContext {
  /** The path to the downloaded file or archive */
  downloadPath: string;
}

/**
 * Install context after extraction phase.
 * Extends PostDownloadInstallContext with extraction-specific information.
 */
export interface PostExtractInstallContext extends PostDownloadInstallContext {
  /** The path to the directory where the archive contents were extracted */
  extractDir: string;
  /** The result of the archive extraction process */
  extractResult: ExtractResult;
}

/**
 * Final install context after successful installation.
 * Extends BaseInstallContext with the final installation results.
 */
export interface FinalInstallContext extends BaseInstallContext {
  /** The path to the installed binary */
  binaryPath: string;
  /** The version of the installed tool */
  version: string;
}

/**
 * Defines the signature for an asynchronous TypeScript installation hook function.
 * These hooks allow for custom logic to be executed at various stages of the tool installation process.
 * @param context - The {@link InstallHookContext} providing details about the current installation.
 * @returns A Promise that resolves when the hook's operations are complete.
 * @example
 * ```typescript
 * // An example afterExtract hook to move a specific binary and set permissions
 * import { $ } from 'zx';
 * import path from 'path';
 *
 * const myHook: AsyncInstallHook = async (context) => {
 *   // Access user configuration from appConfig
 *   const binDir = context.appConfig.paths.binariesDir;
 *   const customPath = context.appConfig.paths.targetDir;
 *
 *   if (context.extractDir && context.extractResult?.executables.includes('my-binary')) {
 *     const sourcePath = path.join(context.extractDir, 'my-binary');
 *     const targetPath = path.join(customPath, context.toolName);
 *     await $`mv ${sourcePath} ${targetPath}`;
 *     await $`chmod +x ${targetPath}`;
 *     console.log(`Moved ${context.toolName} to user-configured path: ${targetPath}`);
 *   }
 * };
 * ```
 */
export type AsyncInstallHook = (context: EnhancedInstallHookContext) => Promise<void>;
