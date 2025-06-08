/**
 * @file generator/src/types/completion.types.ts
 * @description Types related to shell completion management.
 *
 * ## Development Plan
 *
 * ### Tasks
 * - [x] Define types for completion management.
 * - [x] Add JSDoc comments to all types and properties.
 * - [ ] Ensure all necessary imports are present.
 * - [ ] Ensure all types are exported.
 * - [ ] (No dedicated tests needed for this file as it only contains type definitions - correctness verified by TSC and consuming code's tests, as per techContext.md and .roorules)
 * - [ ] Cleanup all linting errors and warnings.
 * - [ ] Cleanup all comments that are no longer relevant (leaving development plan).
 * - [ ] Update the memory bank with the new information when all tasks are complete.
 */

// ============================================
// Completion Management Types
// ============================================

/**
 * Defines the types of shells for which command-line completions can be configured and installed.
 */
export type ShellType =
  /** Zsh (Z Shell) */
  | 'zsh'
  /** Bash (Bourne Again SHell) */
  | 'bash'
  /** Fish (Friendly Interactive SHell) */
  | 'fish';

/**
 * Configuration for installing command-line completion for a specific shell.
 * It specifies the source of the completion file within an extracted archive,
 * an optional custom name for the completion script, and an optional custom target directory.
 */
export interface ShellCompletionConfig {
  /**
   * The path to the completion script file within the extracted archive of a tool.
   * For example, if a tool's archive extracts to `tool-v1.0/` and contains `tool-v1.0/completions/tool.zsh`,
   * this path would be `completions/tool.zsh` (relative to the `extractedDir` provided to `installCompletions`).
   */
  source: string;
  /**
   * An optional custom name for the installed completion script file.
   * If not provided, a default name is typically generated (e.g., `_toolName` for Zsh).
   */
  name?: string;
  /**
   * An optional custom directory where the completion script should be installed.
   * If not provided, a default system or user-specific completion directory for the shell is used.
   */
  targetDir?: string;
}

/**
 * Defines the overall completion configuration for a tool, potentially spanning multiple shells.
 * Each property corresponds to a {@link ShellType} and holds its specific {@link ShellCompletionConfig}.
 */
export interface CompletionConfig {
  /** Configuration for Zsh completions. */
  zsh?: ShellCompletionConfig;
  /** Configuration for Bash completions. */
  bash?: ShellCompletionConfig;
  /** Configuration for Fish completions. */
  fish?: ShellCompletionConfig;
}

/**
 * Defines the contract for a service responsible for installing, managing,
 * and removing command-line completion scripts for tools.
 */
export interface ICompletionInstaller {
  /**
   * Installs completion scripts for a given tool based on the provided configuration.
   * @param toolName The name of the tool for which completions are being installed.
   *                 This is used for naming and organizing completion files.
   * @param extractedDir The root directory where the tool's archive (containing the source completion files)
   *                     has been extracted. The `source` path in {@link ShellCompletionConfig} is relative to this directory.
   * @param config The {@link CompletionConfig} object detailing which shells to install for and where to find
   *               the source completion files.
   * @returns A promise that resolves when all specified completions have been attempted to be installed.
   */
  installCompletions(
    toolName: string,
    extractedDir: string,
    config: CompletionConfig
  ): Promise<void>;

  /**
   * Retrieves the paths to the installed completion files for a given tool.
   * @param toolName The name of the tool.
   * @returns A promise that resolves with a record mapping {@link ShellType} to the path of its
   *          installed completion file, or `undefined` if not installed for that shell.
   */
  getInstalledCompletions(toolName: string): Promise<Record<ShellType, string | undefined>>;

  /**
   * Removes all installed completion scripts for a given tool.
   * @param toolName The name of the tool whose completions should be removed.
   * @returns A promise that resolves when the removal process is complete.
   */
  removeCompletions(toolName: string): Promise<void>;
}
