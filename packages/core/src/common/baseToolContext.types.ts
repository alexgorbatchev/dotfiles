import type { ReplaceInFileMode, ReplaceInFilePattern, ReplaceInFileReplacer } from '@dotfiles/utils';
import type { ProjectConfig } from '../config';
import type { ISystemInfo } from './common.types';

/**
 * User-facing logging interface for tool configurations.
 *
 * This interface provides a simplified logging API for use in `defineTool` callbacks
 * and hooks. Messages are plain strings (not `SafeLogMessage`), making it easy for
 * users to log messages without needing to understand the internal logging system.
 *
 * All log messages are automatically prefixed with `[toolName]` to identify which
 * tool produced the output.
 *
 * @example
 * ```ts
 * export default defineTool((install, ctx) =>
 *   install('github-release', { repo: 'sharkdp/bat' })
 *     .bin('bat')
 *     .hook('after-install', async () => {
 *       ctx.log.info('Running post-install setup...');
 *       ctx.log.debug('Checking configuration files');
 *       ctx.log.warn('Config file not found, using defaults');
 *     })
 * );
 * ```
 */
export interface IToolLog {
  /**
   * Log a trace-level message (most verbose).
   * @param message - The message to log
   */
  trace(message: string): void;

  /**
   * Log a debug-level message.
   * @param message - The message to log
   */
  debug(message: string): void;

  /**
   * Log an info-level message.
   * @param message - The message to log
   */
  info(message: string): void;

  /**
   * Log a warning-level message.
   * @param message - The message to log
   */
  warn(message: string): void;

  /**
   * Log an error-level message.
   * @param message - The message to log
   * @param error - Optional error object to include in the log output
   */
  error(message: string, error?: unknown): void;
}

/**
 * Options for the bound replaceInFile function.
 *
 * Extends the base options with error messaging capability.
 */
export interface IBoundReplaceInFileOptions {
  /** Optional. Defaults to `'file'` when not provided. */
  mode?: ReplaceInFileMode;

  /**
   * Optional error message to log if no replacements were made.
   *
   * When provided and no matches are found, an error is logged with the tool name prefix:
   * `[toolName] <errorMessage>`
   *
   * This is useful for detecting when expected patterns aren't found in config files.
   *
   * @example
   * ```ts
   * await ctx.replaceInFile(
   *   `${ctx.installedDir}/config.toml`,
   *   /theme = ".*"/,
   *   'theme = "dark"',
   *   { errorMessage: 'Could not find theme setting in config.toml' }
   * );
   * ```
   */
  errorMessage?: string;
}

/**
 * Bound replace-in-file function with pre-configured file system.
 *
 * Performs a regex-based replacement within a file. This utility is pre-bound
 * with the resolved file system, so you don't need to pass the fileSystem parameter.
 *
 * **Key behaviors**
 * - Always replaces *all* matches (global replacement), even if `from` does not include the `g` flag.
 * - Supports `to` as either a string or a (a)sync callback.
 * - Supports `mode: 'file'` (default, process the whole file as one string) and `mode: 'line'`
 *   (process each line separately, preserving the original end-of-line sequences).
 * - No-op write: if the computed output is identical to the input content, the file is not written.
 * - Returns `true` if replacements were made, `false` if no matches found.
 *
 * **Replacement callback arguments**
 *
 * When `to` is a function, it receives an `IReplaceInFileMatch` object:
 * - `substring`: the matched substring
 * - `captures`: array of capture groups (which may be `undefined`)
 * - `offset`: the match offset (number)
 * - `input`: the original input string
 * - `groups`: named capture groups object (if present)
 *
 * @param filePath - Path to the file (supports `~` expansion)
 * @param from - Pattern to match (string or RegExp)
 * @param to - Replacement value (string or async callback)
 * @param options - Optional settings (`mode`, `errorMessage`)
 * @returns `true` if any replacements were made, `false` if no matches found
 *
 * @example
 * ```ts
 * const wasReplaced = await ctx.replaceInFile('/path/to/file', /foo/, 'bar');
 * ```
 *
 * @example
 * ```ts
 * await ctx.replaceInFile('~/config.txt', 'foo', 'bar', { mode: 'line' });
 * ```
 *
 * @example
 * ```ts
 * // Log error if pattern not found
 * await ctx.replaceInFile(
 *   '~/config.txt',
 *   /theme = ".*"/,
 *   'theme = "dark"',
 *   { errorMessage: 'Could not find theme setting' }
 * );
 * ```
 */
export type BoundReplaceInFile = (
  filePath: string,
  from: ReplaceInFilePattern,
  to: ReplaceInFileReplacer,
  options?: IBoundReplaceInFileOptions,
) => Promise<boolean>;

/**
 * Provides a base context with common properties and utilities that are shared
 * across various phases of tool configuration and installation.
 *
 * This interface includes essential information such as the tool's identity,
 * important directory paths, and application configuration.
 *
 * @see {@link IToolConfigContext}
 * @see {@link InstallerContext}
 */
export interface IBaseToolContext {
  /**
   * The user's parsed application configuration from the main `config.yaml` file.
   */
  projectConfig: ProjectConfig;

  /**
   * Information about the system on which the installation is occurring
   * (e.g., platform, architecture).
   */
  systemInfo: ISystemInfo;

  /**
   * The name of the tool currently being processed.
   */
  toolName: string;

  /**
   * Absolute path to the directory containing the tool's `.tool.ts` file.
   *
   * This is the **tool configuration directory**. It is the reference point for all
   * relative paths in `.tool.ts` files (for example `./config.toml`, `./themes/`, etc.).
   *
   * This value is derived from the path to the `.tool.ts` file itself.
   *
   * @example
   * If your tool config is located at:
   * `"${projectConfig.paths.toolConfigsDir}/fzf/fzf.tool.ts"`
   * then:
   * `toolDir === "${projectConfig.paths.toolConfigsDir}/fzf"`
   *
   * @example
   * Use `toolDir` to reference a file next to the tool config:
   * `"${toolDir}/shell/key-bindings.zsh"`
   */
  toolDir: string;

  /**
   * Absolute path to the tool's stable "current" directory.
   *
   * This is always the path where the installer will create the `current` symlink:
   * `"${projectConfig.paths.binariesDir}/${toolName}/current"`.
   *
   * Lifecycle note:
   * - This path is always present on the context.
   * - The directory/symlink on disk typically only exists **after a successful install**
   *   (i.e. from post-install hooks onward).
   * - Hooks that run before installation must not assume it exists.
   */
  currentDir: string;

  /**
   * Performs a regex-based replacement within a file.
   *
   * Pre-bound with the resolved file system. See {@link BoundReplaceInFile} for full documentation.
   *
   * @returns `true` if replacements were made, `false` if no matches found
   *
   * @example
   * ```ts
   * // Replace all occurrences of 'foo' with 'bar'
   * const wasReplaced = await ctx.replaceInFile('/path/to/file', /foo/, 'bar');
   *
   * // Line-by-line replacement with callback
   * await ctx.replaceInFile('~/config.txt', /version=(\d+)/, (match) => {
   *   return `version=${Number(match.captures[0]) + 1}`;
   * }, { mode: 'line' });
   *
   * // Log error if pattern not found
   * await ctx.replaceInFile(
   *   '~/config.txt',
   *   /theme = ".*"/,
   *   'theme = "dark"',
   *   { errorMessage: 'Could not find theme setting' }
   * );
   * ```
   */
  replaceInFile: BoundReplaceInFile;

  /**
   * A user-facing logger for logging messages from tool configurations and hooks.
   *
   * All log messages are automatically prefixed with `[toolName]` to identify which
   * tool produced the output.
   *
   * @example
   * ```ts
   * export default defineTool((install, ctx) =>
   *   install('github-release', { repo: 'sharkdp/bat' })
   *     .bin('bat')
   *     .hook('after-install', async () => {
   *       ctx.log.info('Running post-install setup...');
   *       ctx.log.debug('Checking configuration files');
   *     })
   * );
   * ```
   */
  log: IToolLog;
}
