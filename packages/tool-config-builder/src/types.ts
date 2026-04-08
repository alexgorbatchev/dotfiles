import type { ShellCompletionConfigInput, ShellScript } from "@dotfiles/core";
import type { Resolvable } from "@dotfiles/unwrap-value";

/**
 * Input type for path configuration - can be static or resolved via callback.
 */
export type PathConfigInput = Resolvable<void, string>;

/**
 * Internal storage for shell configuration.
 * Holds the accumulated scripts, aliases, environment variables, and completions
 * for a specific shell type before they are finalized into the ToolConfig.
 */
export interface IShellStorage {
  /**
   * List of shell scripts to execute (once or always).
   */
  scripts: ShellScript[];

  /**
   * Map of alias names to their commands.
   */
  aliases: Record<string, string>;

  /**
   * Map of environment variable names to their values.
   */
  env: Record<string, string>;

  /**
   * Map of function names to their bodies.
   */
  functions: Record<string, string>;

  /**
   * List of paths to add to PATH environment variable.
   * Paths are deduplicated during shell init generation.
   */
  paths: PathConfigInput[];

  /**
   * Resolvable configuration for shell completions.
   * Stored as the raw input and resolved at generation time when version is known.
   */
  completions?: ShellCompletionConfigInput;
}

/**
 * Container for configuration storage of all supported shell types.
 * Used internally by the builder to track configurations for each shell.
 */
export interface InternalShellConfigs {
  /**
   * Configuration storage for Zsh.
   */
  zsh: IShellStorage;

  /**
   * Configuration storage for Bash.
   */
  bash: IShellStorage;

  /**
   * Configuration storage for PowerShell.
   */
  powershell: IShellStorage;
}

/**
 * Supported shell types as keys of the internal configuration storage.
 */
export type ShellTypeKey = keyof InternalShellConfigs;
