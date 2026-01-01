import type { ShellCompletionConfigInput, ShellScript } from '@dotfiles/core';

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
  environment: Record<string, string>;

  /**
   * Map of function names to their bodies.
   * Functions are wrapped with HOME override similar to always scripts.
   */
  functions: Record<string, string>;

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
